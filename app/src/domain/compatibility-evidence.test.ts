import { describe, expect, it } from "vitest";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import {
  createCompatibilityEvidenceRecord,
  emptyCompatibilityCheckpoints,
  latestCompatibilityEvidence,
} from "./compatibility-evidence";

const item: InventoryCatalogItem = {
  catalogKey: "hangmap-075",
  sourceRow: 77,
  model: "Dell Latitude 5420",
  modelAliases: ["Dell Latitude 5420", "Dell Latitude 5430"],
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
  compatibleModels: 2,
  dataQuality: "ready",
  dataQualityIssues: [],
  planningDataStatus: "sample",
};

const validInput = {
  catalogKey: item.catalogKey,
  model: "Dell Latitude 5420",
  status: "approved" as const,
  manufacturerPartNumber: "0A12345",
  photoReference: "FOTO-5420-E1",
  keyboardWidthMm: 285,
  keyboardHeightMm: 105,
  checkpoints: {
    enterShape: true,
    shiftKeys: true,
    arrowKeys: true,
    functionRow: true,
    pointingStickAndNumpad: true,
  },
  notes: "Droge pastest zonder kleefcontact uitgevoerd.",
};

describe("fysiek compatibiliteitsbewijs", () => {
  it("maakt een herleidbaar goedgekeurd bewijs voor exact model en hangmap", () => {
    const record = createCompatibilityEvidenceRecord(
      [item],
      validInput,
      {
        id: "evidence-1",
        recordedAt: "2026-07-28T12:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(record).toMatchObject({
      sku: "NB10172E1NL",
      storageNumber: 75,
      variant: "E1",
      model: "Dell Latitude 5420",
      status: "approved",
    });
  });

  it("blokkeert goedkeuring zolang een fysiek controlepunt ontbreekt", () => {
    expect(() => createCompatibilityEvidenceRecord(
      [item],
      {
        ...validInput,
        checkpoints: {
          ...validInput.checkpoints,
          arrowKeys: false,
        },
      },
      {
        id: "evidence-2",
        recordedAt: "2026-07-28T12:01:00.000Z",
        reviewer: "Tim Beek",
      },
    )).toThrow(/alle vijf/);
  });

  it("vereist een inhoudelijke reden voor een afgewezen pastest", () => {
    expect(() => createCompatibilityEvidenceRecord(
      [item],
      {
        ...validInput,
        status: "rejected",
        checkpoints: emptyCompatibilityCheckpoints,
        notes: "",
      },
      {
        id: "evidence-3",
        recordedAt: "2026-07-28T12:02:00.000Z",
        reviewer: "Tim Beek",
      },
    )).toThrow(/vast wat fysiek niet overeenkomt/);
  });

  it("gebruikt voor werknemers altijd de laatste beoordeling", () => {
    const approved = createCompatibilityEvidenceRecord(
      [item],
      validInput,
      {
        id: "evidence-1",
        recordedAt: "2026-07-28T12:00:00.000Z",
        reviewer: "Tim Beek",
      },
    );
    const rejected = createCompatibilityEvidenceRecord(
      [item],
      {
        ...validInput,
        status: "rejected",
        checkpoints: emptyCompatibilityCheckpoints,
        notes: "Pijltoetsuitsparing wijkt fysiek af.",
      },
      {
        id: "evidence-2",
        recordedAt: "2026-07-28T12:05:00.000Z",
        reviewer: "Tim Beek",
      },
    );

    expect(latestCompatibilityEvidence(
      [approved, rejected],
      item.catalogKey,
      "5420",
    )).toBeNull();
    expect(latestCompatibilityEvidence(
      [approved, rejected],
      item.catalogKey,
      "Dell Latitude 5420",
    )).toEqual(rejected);
  });
});
