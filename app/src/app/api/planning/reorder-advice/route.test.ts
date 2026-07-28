import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/planning/reorder-advice", () => {
  it("berekent advies voor meerdere externe referenties", async () => {
    const response = await POST(new Request("http://localhost/api/planning/reorder-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            reference: "NB10052E1NL",
            onHand: 15,
            reserved: 2,
            averageWeeklyDemand: 5,
            leadTimeDays: 14,
            safetyStockWeeks: 1,
          },
        ],
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      reference: "NB10052E1NL",
      reorderPoint: 15,
      recommendedOrderQuantity: 22,
      status: "order",
    });
  });

  it("weigert een leeg verzoek", async () => {
    const response = await POST(new Request("http://localhost/api/planning/reorder-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    }));

    expect(response.status).toBe(400);
  });
});
