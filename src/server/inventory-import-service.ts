import "server-only";
import { createHash } from "node:crypto";
import type { TransactionSql } from "postgres";
import readXlsxFile from "read-excel-file/node";
import { z } from "zod";
import {
  analyzeInventoryWorkbook,
  InventoryWorkbookError,
  type InventoryImportIssue,
  type WorkbookSheet,
} from "@/import/inventory-workbook";
import { database } from "@/server/database";

const importMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  actorId: z.string().uuid(),
});

export type ImportInventoryWorkbookInput = z.input<typeof importMetadataSchema> & {
  contents: Buffer;
};

export async function importInventoryWorkbook(rawInput: ImportInventoryWorkbookInput) {
  const input = importMetadataSchema.parse(rawInput);
  const sourceSha256 = createHash("sha256").update(rawInput.contents).digest("hex");
  const sheets = (await readXlsxFile(rawInput.contents)) as WorkbookSheet[];
  const analysis = analyzeInventoryWorkbook(sheets);
  const sql = database();

  return sql.begin(async (transaction) => {
    const [createdBatch] = await transaction<{ id: string }[]>`
      insert into inventory_import_batches (
        source_file_name,
        source_sha256,
        imported_by
      )
      values (
        ${input.fileName},
        ${sourceSha256},
        ${input.actorId}::uuid
      )
      on conflict (source_sha256) do nothing
      returning id
    `;

    if (!createdBatch) {
      const [existingBatch] = await transaction<ImportBatchResult[]>`
        select
          id as "batchId",
          status,
          record_count as "recordCount",
          total_quantity as "totalQuantity",
          error_count as "errorCount",
          warning_count as "warningCount",
          review_count as "reviewCount"
        from inventory_import_batches
        where source_sha256 = ${sourceSha256}
        limit 1
      `;
      return { ...existingBatch, duplicate: true };
    }

    const rowIds = new Map<number, string>();
    for (const row of analysis.rows) {
      const [createdRow] = await transaction<{ id: string }[]>`
        insert into inventory_import_rows (
          batch_id,
          source_sheet,
          source_row,
          source_number,
          model_name,
          normalized_model_name,
          quantity,
          layout_name,
          sku,
          linked_models_text,
          notes,
          raw_data
        )
        values (
          ${createdBatch.id}::uuid,
          'Productie',
          ${row.sourceRow},
          ${row.number},
          ${row.model},
          ${row.normalizedModel},
          ${row.quantity},
          ${row.layout},
          ${row.sku},
          ${row.linkedModels},
          ${row.notes},
          ${transaction.json(row.rawData)}
        )
        returning id
      `;
      rowIds.set(row.sourceRow, createdRow.id);
    }

    for (const issue of analysis.issues) {
      await insertIssue(transaction, createdBatch.id, rowIds, issue);
    }

    const status = analysis.summary.errors > 0 || analysis.summary.reviews > 0
      ? "needs_review"
      : "ready";
    const [batch] = await transaction<ImportBatchResult[]>`
      update inventory_import_batches
      set
        status = ${status},
        record_count = ${analysis.summary.records},
        total_quantity = ${analysis.summary.totalQuantity},
        error_count = ${analysis.summary.errors},
        warning_count = ${analysis.summary.warnings},
        review_count = ${analysis.summary.reviews}
      where id = ${createdBatch.id}::uuid
      returning
        id as "batchId",
        status,
        record_count as "recordCount",
        total_quantity as "totalQuantity",
        error_count as "errorCount",
        warning_count as "warningCount",
        review_count as "reviewCount"
    `;

    return { ...batch, duplicate: false };
  });
}

type ImportBatchResult = {
  batchId: string;
  status: "processing" | "needs_review" | "ready" | "applied" | "failed";
  recordCount: number;
  totalQuantity: number;
  errorCount: number;
  warningCount: number;
  reviewCount: number;
};

async function insertIssue(
  transaction: TransactionSql,
  batchId: string,
  rowIds: Map<number, string>,
  issue: InventoryImportIssue,
) {
  await transaction`
    insert into inventory_import_issues (
      batch_id,
      import_row_id,
      severity,
      field_name,
      issue_code,
      message
    )
    values (
      ${batchId}::uuid,
      ${rowIds.get(issue.sourceRow) ?? null}::uuid,
      ${issue.severity},
      ${issue.field},
      ${issue.code},
      ${issue.message}
    )
  `;
}

export function inventoryImportErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return { status: 400, body: { error: "INVALID_INPUT", details: error.flatten() } };
  }
  if (error instanceof InventoryWorkbookError) {
    return { status: 422, body: { error: error.code, message: error.message } };
  }
  throw error;
}
