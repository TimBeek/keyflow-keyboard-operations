import { z } from "zod";
import { calculateForecastAdvice, ForecastRuleError } from "../../../../domain/forecasting";

export const runtime = "nodejs";

const planningRequestSchema = z.object({
  items: z.array(z.object({
    reference: z.string().min(1).max(100),
    onHand: z.number().int().min(0).max(1_000_000),
    reserved: z.number().int().min(0).max(1_000_000).optional(),
    openOrder: z.number().int().min(0).max(1_000_000).optional(),
    averageWeeklyDemand: z.number().min(0).max(1_000_000),
    leadTimeDays: z.number().min(0).max(3650),
    safetyStockWeeks: z.number().min(0).max(52),
    reviewPeriodWeeks: z.number().min(0).max(52).optional(),
  })).min(1).max(500),
});

export async function POST(request: Request) {
  try {
    const input = planningRequestSchema.parse(await request.json());
    return Response.json({
      generatedAt: new Date().toISOString(),
      items: input.items.map(({ reference, ...forecastInput }) => ({
        reference,
        ...calculateForecastAdvice(forecastInput),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "INVALID_INPUT", details: error.flatten() },
        { status: 400 },
      );
    }
    if (error instanceof ForecastRuleError) {
      return Response.json(
        { error: "INVALID_FORECAST_INPUT", message: error.message },
        { status: 422 },
      );
    }
    throw error;
  }
}
