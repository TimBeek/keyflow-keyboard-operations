import { describe, expect, it } from "vitest";
import { inventoryCatalog } from "../data/inventory-catalog";
import {
  catalogModelOptions,
  modelMatchesCatalogItem,
} from "./model-catalog";

describe("modelcatalogus uit Excel-compatibiliteit", () => {
  it("maakt gekoppelde modellen doorzoekbaar zonder duplicaten", () => {
    const options = catalogModelOptions(inventoryCatalog);

    expect(options).toContain("Dell Latitude 7420");
    expect(options.filter((model) => model.toLowerCase() === "dell latitude 5420")).toHaveLength(1);
  });

  it("herkent een gekoppeld model op dezelfde Noviply-hangmap", () => {
    const item = inventoryCatalog.find(({ storageNumber }) => storageNumber === 75);

    expect(item).toBeDefined();
    expect(modelMatchesCatalogItem("Dell Latitude 7420", item!)).toBe(true);
  });

  it("sluit geblokkeerde Excelregels uit van werknemerskeuzes", () => {
    const options = catalogModelOptions(inventoryCatalog);

    expect(options).not.toContain("Dell Precision 7530");
  });
});
