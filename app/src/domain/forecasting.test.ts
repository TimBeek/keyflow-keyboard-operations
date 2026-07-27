import { describe, expect, it } from "vitest";
import { calculateForecastAdvice, ForecastRuleError } from "./forecasting";

describe("calculateForecastAdvice", () => {
  it("berekent bestelpunt en advies met levertijd en veiligheidsvoorraad", () => {
    expect(calculateForecastAdvice({
      onHand: 15,
      reserved: 2,
      averageWeeklyDemand: 5,
      leadTimeDays: 14,
      safetyStockWeeks: 1,
    })).toEqual({
      available: 13,
      leadTimeDemand: 10,
      safetyStock: 5,
      reorderPoint: 15,
      targetStock: 35,
      recommendedOrderQuantity: 22,
      coverageWeeks: 2.6,
      status: "order",
    });
  });

  it("trekt open bestellingen af van het besteladvies", () => {
    const advice = calculateForecastAdvice({
      onHand: 4,
      openOrder: 20,
      averageWeeklyDemand: 4,
      leadTimeDays: 14,
      safetyStockWeeks: 1,
    });

    expect(advice.available).toBe(24);
    expect(advice.recommendedOrderQuantity).toBe(4);
    expect(advice.status).toBe("healthy");
  });

  it("markeert voorraad zonder vraag als overvoorraad", () => {
    const advice = calculateForecastAdvice({
      onHand: 30,
      averageWeeklyDemand: 0,
      leadTimeDays: 14,
      safetyStockWeeks: 1,
    });

    expect(advice.status).toBe("excess");
    expect(advice.coverageWeeks).toBeNull();
  });

  it("weigert negatieve invoer", () => {
    expect(() => calculateForecastAdvice({
      onHand: -1,
      averageWeeklyDemand: 2,
      leadTimeDays: 14,
      safetyStockWeeks: 1,
    })).toThrowError(ForecastRuleError);
  });
});
