import { describe, expect, it } from "vitest";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import {
  createModelGroupDecision,
  createModelGroupProposals,
  latestModelGroupDecisions,
} from "./model-grouping";

const baseItem: InventoryCatalogItem = {
  catalogKey: "hangmap-075",
  sourceRow: 77,
  model: "Dell Latitude 5420",
  modelAliases: [
    "Dell Latitude 5420",
    "Dell Latitude 5430",
    "Dell Precision 3470",
  ],
  sku: "NB10172E1NL",
  layout: "QWERTY US",
  stock: 25,
  reserved: 0,
  averageWeeklyDemand: 4,
  leadTimeDays: 14,
  safetyStockWeeks: 2,
  location: "Hangmappenwagen",
  storageNumber: 75,
  supplier: "Noviply",
  unitCost: 2.35,
  compatibleModels: 3,
  dataQuality: "ready",
  dataQualityIssues: [],
  planningDataStatus: "sample",
};

describe("modelgroepvoorstellen", () => {
  it("maakt een herleidbaar voorstel zonder compatibiliteit automatisch goed te keuren", () => {
    const proposals = createModelGroupProposals([baseItem]);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      id: "modelgroep-hangmap-075",
      manufacturer: "Dell",
      sku: "NB10172E1NL",
      storageNumber: 75,
      variant: "E1",
      models: baseItem.modelAliases,
    });
    expect(proposals[0].confidence).toBeLessThan(80);
    expect(proposals[0].missingEvidence).toContain("Fysieke droge pastest");
  });

  it("markeert modellen die in meerdere SKU/layout-combinaties voorkomen", () => {
    const proposals = createModelGroupProposals([
      baseItem,
      {
        ...baseItem,
        catalogKey: "hangmap-076",
        storageNumber: 76,
        sourceRow: 78,
        sku: "NB10173E2NL",
        modelAliases: ["Dell Latitude 5420", "Dell Latitude 5431"],
      },
    ]);

    expect(proposals[0].conflictingModels).toContain("Dell Latitude 5420");
    expect(proposals[1].conflictingModels).toContain("Dell Latitude 5420");
  });

  it("blokkeert goedkeuring zonder alle fysieke bewijsvelden", () => {
    const proposal = createModelGroupProposals([baseItem])[0];

    expect(() => createModelGroupDecision(
      proposal,
      {
        status: "approved",
        manufacturerPartNumber: "0A12345",
        photoReference: "FOTO-75",
        notes: "",
        evidence: {
          exactVariantConfirmed: true,
          manufacturerPartNumberConfirmed: true,
          photoConfirmed: true,
          dryFitPassed: false,
        },
      },
      {
        id: "decision-1",
        decidedAt: "2026-07-28T10:00:00.000Z",
        reviewer: "Tim Beek",
      },
    )).toThrow(/droge pastest/);
  });

  it("bewaart een volledige goedkeuring en kiest steeds het laatste besluit", () => {
    const proposal = createModelGroupProposals([baseItem])[0];
    const approved = createModelGroupDecision(
      proposal,
      {
        status: "approved",
        manufacturerPartNumber: "0A12345",
        photoReference: "FOTO-75",
        notes: "",
        evidence: {
          exactVariantConfirmed: true,
          manufacturerPartNumberConfirmed: true,
          photoConfirmed: true,
          dryFitPassed: true,
        },
      },
      {
        id: "decision-1",
        decidedAt: "2026-07-28T10:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );
    const rejected = createModelGroupDecision(
      proposal,
      {
        status: "rejected",
        manufacturerPartNumber: "",
        photoReference: "",
        notes: "Andere Enter-vorm aangetroffen.",
        evidence: {
          exactVariantConfirmed: false,
          manufacturerPartNumberConfirmed: false,
          photoConfirmed: false,
          dryFitPassed: false,
        },
      },
      {
        id: "decision-2",
        decidedAt: "2026-07-28T10:05:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(latestModelGroupDecisions([rejected, approved]).get(proposal.id))
      .toEqual(rejected);
  });
});
