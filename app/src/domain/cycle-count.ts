export type StockCountStatus = "matched" | "shortage" | "overage";

export type StockCountRecord = {
  id: string;
  occurredAt: string;
  catalogKey: string;
  storageNumber: number;
  sku: string;
  model: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
  status: StockCountStatus;
  notes?: string;
  actor: string;
};

export type StockCountInput = {
  catalogKey: string;
  countedQuantity: number;
  notes?: string;
};

export function calculateStockCount(
  expectedQuantity: number,
  countedQuantity: number,
  notes?: string,
) {
  assertQuantity(expectedQuantity, "Systeemvoorraad");
  assertQuantity(countedQuantity, "Getelde voorraad");
  const difference = countedQuantity - expectedQuantity;
  const normalizedNotes = notes?.trim();

  if (difference !== 0 && (!normalizedNotes || normalizedNotes.length < 3)) {
    throw new StockCountRuleError(
      "Licht een telverschil toe met minimaal 3 tekens.",
    );
  }

  return {
    expectedQuantity,
    countedQuantity,
    difference,
    status: difference === 0
      ? "matched" as const
      : difference < 0
        ? "shortage" as const
        : "overage" as const,
    notes: normalizedNotes || undefined,
  };
}

function assertQuantity(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new StockCountRuleError(
      `${label} moet een geheel getal tussen 0 en 1.000.000 zijn.`,
    );
  }
}

export class StockCountRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockCountRuleError";
  }
}
