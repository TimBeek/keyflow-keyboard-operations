import { describe, expect, it } from "vitest";
import { lookupWorkOrder, normalizeOrderKey, type WorkOrderSnapshot } from "./order-lookup";

/** Testgegevens horen in de test, niet in de app zelf. */
const workOrders: WorkOrderSnapshot[] = [
  {
    reference: "ORD-260727-1859",
    aliases: ["ORD-1859", "1859"],
    model: "Dell Latitude 5420",
    saleValueBandId: "200_299",
    currentLayout: "QWERTY SE/FI",
    targetLayout: "QWERTY US",
    status: "ready",
  },
  {
    reference: "ORD-260727-1864",
    aliases: ["ORD-1864", "1864"],
    model: "HP ZBook 15 G3",
    saleValueBandId: "200_299",
    currentLayout: "QWERTY US",
    targetLayout: "QWERTZ DE",
    status: "ready",
  },
  {
    reference: "ORD-260727-1872",
    aliases: ["ORD-1872", "1872"],
    model: "Fujitsu Lifebook U7410",
    saleValueBandId: "300_399",
    currentLayout: "QWERTY US",
    targetLayout: "AZERTY FR",
    status: "hold",
    note: "Wacht op voorraadcontrole.",
  },
];

describe("orderlookup na een barcodescan", () => {
  it("laadt een volledige orderreferentie", () => {
    const result = lookupWorkOrder("ORD-260727-1859", workOrders);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.order.model).toBe("Dell Latitude 5420");
      expect(result.order.saleValueBandId).toBe("200_299");
      expect(result.order.targetLayout).toBe("QWERTY US");
    }
  });

  it("herkent ook de korte barcode-alias", () => {
    expect(lookupWorkOrder("ORD-1859", workOrders)).toMatchObject({
      status: "found",
      order: { reference: "ORD-260727-1859" },
    });
  });

  it("kan een ordercode aan het einde van een barcode-URL lezen", () => {
    expect(lookupWorkOrder(
      "https://orders.example.test/scan/ORD-260727-1864",
      workOrders,
    )).toMatchObject({
      status: "found",
      order: { model: "HP ZBook 15 G3" },
    });
  });

  it("vult geen onbekende order stilzwijgend in", () => {
    expect(lookupWorkOrder("ORD-9999", workOrders).status).toBe("not_found");
  });

  it("normaliseert gangbare barcode-opmaak", () => {
    expect(normalizeOrderKey(" ord/260727/1859 ")).toBe("ORD2607271859");
  });
});
