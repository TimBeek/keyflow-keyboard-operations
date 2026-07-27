import { describe, expect, it } from "vitest";
import { demoWorkOrders } from "../data/orders-demo";
import { lookupWorkOrder, normalizeOrderKey } from "./order-lookup";

describe("orderlookup na een barcodescan", () => {
  it("laadt een volledige orderreferentie", () => {
    const result = lookupWorkOrder("ORD-260727-1859", demoWorkOrders);
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.order.model).toBe("Dell Latitude 5420");
      expect(result.order.saleValueBandId).toBe("200_299");
      expect(result.order.targetLayout).toBe("QWERTY US");
    }
  });

  it("herkent ook de korte barcode-alias", () => {
    expect(lookupWorkOrder("ORD-1859", demoWorkOrders)).toMatchObject({
      status: "found",
      order: { reference: "ORD-260727-1859" },
    });
  });

  it("kan een ordercode aan het einde van een barcode-URL lezen", () => {
    expect(lookupWorkOrder(
      "https://orders.example.test/scan/ORD-260727-1864",
      demoWorkOrders,
    )).toMatchObject({
      status: "found",
      order: { model: "HP ZBook 15 G3" },
    });
  });

  it("vult geen onbekende order stilzwijgend in", () => {
    expect(lookupWorkOrder("ORD-9999", demoWorkOrders).status).toBe("not_found");
  });

  it("normaliseert gangbare barcode-opmaak", () => {
    expect(normalizeOrderKey(" ord/260727/1859 ")).toBe("ORD2607271859");
  });
});
