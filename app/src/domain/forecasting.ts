export type ForecastInput = {
  onHand: number;
  reserved?: number;
  openOrder?: number;
  averageWeeklyDemand: number;
  leadTimeDays: number;
  safetyStockWeeks: number;
  reviewPeriodWeeks?: number;
};

export type StockAdviceStatus = "out" | "critical" | "order" | "healthy" | "excess";

export type ForecastAdvice = {
  available: number;
  leadTimeDemand: number;
  safetyStock: number;
  reorderPoint: number;
  targetStock: number;
  recommendedOrderQuantity: number;
  coverageWeeks: number | null;
  status: StockAdviceStatus;
};

export function calculateForecastAdvice(input: ForecastInput): ForecastAdvice {
  assertNonNegative(input.onHand, "Voorraad");
  assertNonNegative(input.reserved ?? 0, "Gereserveerd");
  assertNonNegative(input.openOrder ?? 0, "Open bestelling");
  assertNonNegative(input.averageWeeklyDemand, "Gemiddeld weekverbruik");
  assertNonNegative(input.leadTimeDays, "Levertijd");
  assertNonNegative(input.safetyStockWeeks, "Veiligheidsvoorraad");

  const reserved = input.reserved ?? 0;
  const openOrder = input.openOrder ?? 0;
  const reviewPeriodWeeks = input.reviewPeriodWeeks ?? 4;
  const netOnHand = Math.max(0, input.onHand - reserved);
  const available = netOnHand + openOrder;
  const leadTimeWeeks = input.leadTimeDays / 7;
  const leadTimeDemand = Math.ceil(input.averageWeeklyDemand * leadTimeWeeks);
  const safetyStock = Math.ceil(input.averageWeeklyDemand * input.safetyStockWeeks);
  const reorderPoint = leadTimeDemand + safetyStock;
  const targetStock = Math.ceil(
    input.averageWeeklyDemand * (leadTimeWeeks + input.safetyStockWeeks + reviewPeriodWeeks),
  );
  const recommendedOrderQuantity = Math.max(0, targetStock - available);
  const coverageWeeks = input.averageWeeklyDemand === 0
    ? null
    : Number((netOnHand / input.averageWeeklyDemand).toFixed(1));

  let status: StockAdviceStatus = "healthy";
  if (netOnHand === 0) status = "out";
  else if (input.averageWeeklyDemand === 0 && netOnHand > 0) status = "excess";
  else if (available <= leadTimeDemand) status = "critical";
  else if (available <= reorderPoint) status = "order";

  return {
    available,
    leadTimeDemand,
    safetyStock,
    reorderPoint,
    targetStock,
    recommendedOrderQuantity,
    coverageWeeks,
    status,
  };
}

function assertNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new ForecastRuleError(`${label} mag niet negatief zijn.`);
  }
}

export class ForecastRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastRuleError";
  }
}
