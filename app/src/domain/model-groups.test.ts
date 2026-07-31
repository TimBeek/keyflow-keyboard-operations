import { describe, expect, it } from "vitest";
import { inventoryCatalog } from "../data/inventory-catalog";
import { buildModelGroupAudit } from "./model-groups";

describe("modelgroepaudit op de Excelbron", () => {
  const audit = buildModelGroupAudit(inventoryCatalog);

  it("maakt voor iedere hangmap een herleidbare kandidaatgroep", () => {
    expect(audit.groups).toHaveLength(148);
    expect(audit.groups.find(({ storageNumber }) => storageNumber === 75)).toMatchObject({
      primaryModel: "Dell Latitude 5420",
      sku: "NB10172E1NL",
      variant: "E1",
      layout: "QWERTY US",
    });
  });

  it("houdt geen bronregel meer buiten de deur", () => {
    // De negen mappen zonder of met een dubbel artikelnummer hebben nu elk een
    // eigen voorraadsleutel en doen gewoon mee.
    expect(audit.blockedSources).toBe(0);
  });

  it("signaleert modellen die naar meerdere SKU's voor dezelfde layout verwijzen", () => {
    expect(audit.conflicts.length).toBeGreaterThan(0);
    expect(audit.conflicts.every(({ skus }) => skus.length > 1)).toBe(true);
  });

  it("houdt een fysieke goedkeuring buiten de geïmporteerde Excelclaims", () => {
    expect(audit.groups.some(({ status }) => status === "imported_unverified")).toBe(true);
    expect(audit.groups.every(({ status }) => status !== ("approved" as never))).toBe(true);
  });
});
