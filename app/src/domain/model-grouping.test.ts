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
  stockKey: "NB10172E1NL",
  ownNumber: false,
  sharedNumber: false,
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
  planningDataStatus: "unconfigured",
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

  it("keurt goed zonder vooraf bewijs te eisen", () => {
    const proposal = createModelGroupProposals([baseItem])[0];

    const decision = createModelGroupDecision(
      proposal,
      {
        status: "approved",
        manufacturerPartNumber: "",
        photoReference: "",
        notes: "",
        evidence: {
          exactVariantConfirmed: false,
          manufacturerPartNumberConfirmed: false,
          photoConfirmed: false,
          dryFitPassed: false,
        },
        excludedModels: [],
        addedModels: [],
      },
      {
        id: "decision-1",
        decidedAt: "2026-07-28T10:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(decision.status).toBe("approved");
    expect(decision.proposalId).toBe(proposal.id);
  });

  it("bewaart bewijs dat later alsnog wordt aangevuld", () => {
    const proposal = createModelGroupProposals([baseItem])[0];

    const decision = createModelGroupDecision(
      proposal,
      {
        status: "approved",
        manufacturerPartNumber: "  0A12345  ",
        photoReference: "  FOTO-75  ",
        notes: "  Onderdeelnummer achteraf gecontroleerd.  ",
        evidence: {
          exactVariantConfirmed: true,
          manufacturerPartNumberConfirmed: true,
          photoConfirmed: false,
          dryFitPassed: false,
        },
        excludedModels: [],
        addedModels: [],
      },
      {
        id: "decision-2",
        decidedAt: "2026-07-28T11:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(decision.manufacturerPartNumber).toBe("0A12345");
    expect(decision.photoReference).toBe("FOTO-75");
    expect(decision.notes).toBe("Onderdeelnummer achteraf gecontroleerd.");
    expect(decision.evidence.photoConfirmed).toBe(false);
  });

  it("wijst af zonder een verplichte reden", () => {
    const proposal = createModelGroupProposals([baseItem])[0];

    const decision = createModelGroupDecision(
      proposal,
      {
        status: "rejected",
        manufacturerPartNumber: "",
        photoReference: "",
        notes: "",
        evidence: {
          exactVariantConfirmed: false,
          manufacturerPartNumberConfirmed: false,
          photoConfirmed: false,
          dryFitPassed: false,
        },
        excludedModels: [],
        addedModels: [],
      },
      {
        id: "decision-3",
        decidedAt: "2026-07-28T12:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(decision.status).toBe("rejected");
  });

  it("houdt alleen modellen over die de beoordelaar laat staan", () => {
    const proposal = createModelGroupProposals([baseItem])[0];

    const decision = createModelGroupDecision(
      proposal,
      {
        status: "approved",
        manufacturerPartNumber: "",
        photoReference: "",
        notes: "",
        evidence: {
          exactVariantConfirmed: false,
          manufacturerPartNumberConfirmed: false,
          photoConfirmed: false,
          dryFitPassed: false,
        },
        // Dubbel, met spaties, plus een model dat niet in het voorstel zit.
        excludedModels: [
          "  Dell Precision 3470  ",
          "Dell Precision 3470",
          "HP EliteBook 840",
          "",
        ],
        addedModels: ["  Dell Latitude 5440  ", "Dell Latitude 5440", "Dell Latitude 5420"],
      },
      {
        id: "decision-4",
        decidedAt: "2026-07-28T13:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(decision.excludedModels).toEqual(["Dell Precision 3470"]);
    // Dubbel weggehaald; "Dell Latitude 5420" stond al in het voorstel.
    expect(decision.addedModels).toEqual(["Dell Latitude 5440"]);
  });

  it("voegt geen model toe dat zojuist is weggehaald", () => {
    const proposal = createModelGroupProposals([baseItem])[0];

    const decision = createModelGroupDecision(
      proposal,
      {
        status: "approved",
        manufacturerPartNumber: "",
        photoReference: "",
        notes: "",
        evidence: {
          exactVariantConfirmed: false,
          manufacturerPartNumberConfirmed: false,
          photoConfirmed: false,
          dryFitPassed: false,
        },
        excludedModels: ["Dell Precision 3470"],
        addedModels: ["Dell Precision 3470"],
      },
      {
        id: "decision-5",
        decidedAt: "2026-07-28T14:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(decision.addedModels).toEqual([]);
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
        excludedModels: [],
        addedModels: [],
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
        excludedModels: [],
        addedModels: [],
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
