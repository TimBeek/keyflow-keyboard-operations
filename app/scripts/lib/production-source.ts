import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  createProductionBootstrapPlan,
  type ProductionBootstrapPlan,
} from "../../src/domain/production-bootstrap";

const sourceDocumentSchema = z.object({
  metadata: z.object({
    fileName: z.string().min(1),
    sheet: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    rowCount: z.number().int().positive(),
    totalQuantity: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(z.object({
    sourceRow: z.number().int().positive(),
    storageNumber: z.number().int().positive(),
    model: z.string(),
    stock: z.number().int().nonnegative(),
    layout: z.string(),
    sku: z.string(),
    linkedModels: z.string(),
    notes: z.string(),
  }).strict()),
}).strict();

export async function loadProductionSource(
  sourcePath = process.env.KEYFLOW_INVENTORY_SOURCE ?? "db/seed/inventory-source.json",
): Promise<ProductionBootstrapPlan> {
  const resolvedPath = path.resolve(sourcePath);
  const document = sourceDocumentSchema.parse(
    JSON.parse(await readFile(resolvedPath, "utf8")),
  );
  return createProductionBootstrapPlan(document.metadata, document.rows);
}

export function productionPlanSummary(plan: ProductionBootstrapPlan) {
  return {
    sourceSha256: plan.metadata.sha256,
    sourceRows: plan.rows.length,
    sourceQuantity: plan.metadata.totalQuantity,
    operationalRows: plan.operationalRows.length,
    operationalQuantity: plan.operationalQuantity,
    blockedRows: plan.blockedRows.length,
    models: plan.models.length,
  };
}
