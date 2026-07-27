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
import {
  InventoryResolutionError,
  resolutionActionSchema,
  validateImportResolution,
  type ResolutionAction,
} from "@/import/inventory-resolution";
import { database } from "@/server/database";
import {
  AuthorizationError,
  requirePermission,
} from "@/server/authorization-service";

const importMetadataSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  actorId: z.string().uuid(),
});

const importIdSchema = z.string().uuid();
const resolveImportIssueSchema = z.object({
  batchId: z.string().uuid(),
  issueId: z.string().uuid(),
  actorId: z.string().uuid(),
  resolved: z.boolean(),
  resolutionNote: z.string().trim().min(3).max(500),
  resolutionAction: resolutionActionSchema,
  correctedValue: z.string().max(500).optional(),
});

export type ImportInventoryWorkbookInput = z.input<typeof importMetadataSchema> & {
  contents: Buffer;
};

export async function importInventoryWorkbook(rawInput: ImportInventoryWorkbookInput) {
  const input = importMetadataSchema.parse(rawInput);
  await requirePermission(input.actorId, "imports.manage");
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
          ${row.storageNumber},
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

export async function getInventoryImportReview(rawBatchId: string, actorId: string) {
  const batchId = importIdSchema.parse(rawBatchId);
  await requirePermission(actorId, "imports.manage");
  const sql = database();
  const [batch] = await sql<ImportReviewBatch[]>`
    select
      id as "batchId",
      source_file_name as "fileName",
      status,
      record_count as "recordCount",
      total_quantity as "totalQuantity",
      error_count as "errorCount",
      warning_count as "warningCount",
      review_count as "reviewCount",
      imported_at as "importedAt"
    from inventory_import_batches
    where id = ${batchId}::uuid
    limit 1
  `;
  if (!batch) {
    throw new InventoryImportPersistenceError("IMPORT_NOT_FOUND", "Voorraadimport niet gevonden.");
  }

  const issues = await sql<ImportReviewIssue[]>`
    select
      issue.id as "issueId",
      issue.severity,
      issue.field_name as "field",
      issue.issue_code as "code",
      issue.message,
      issue.resolved,
      issue.resolution_note as "resolutionNote",
      issue.resolution_action as "resolutionAction",
      issue.corrected_value as "correctedValue",
      issue.resolved_at as "resolvedAt",
      row.source_row as "sourceRow",
      row.source_number as "storageNumber",
      row.model_name as "model",
      row.quantity,
      row.layout_name as "layout",
      row.sku,
      row.linked_models_text as "linkedModels"
    from inventory_import_issues issue
    left join inventory_import_rows row on row.id = issue.import_row_id
    where issue.batch_id = ${batchId}::uuid
    order by
      issue.resolved asc,
      case issue.severity when 'error' then 1 when 'review' then 2 else 3 end,
      row.source_row asc,
      issue.id asc
  `;

  return {
    ...batch,
    openIssueCount: issues.filter(({ resolved }) => !resolved).length,
    issues,
  };
}

export async function resolveInventoryImportIssue(rawInput: z.input<typeof resolveImportIssueSchema>) {
  const input = resolveImportIssueSchema.parse(rawInput);
  await requirePermission(input.actorId, "imports.manage");
  const sql = database();

  return sql.begin(async (transaction) => {
    const [issue] = await transaction<{
      issue_id: string;
      batch_status: ImportBatchResult["status"];
      import_row_id: string | null;
      severity: ImportReviewIssue["severity"];
      field: string;
    }[]>`
      select
        issue.id as issue_id,
        issue.import_row_id,
        issue.severity,
        issue.field_name as field,
        batch.status as batch_status
      from inventory_import_issues issue
      inner join inventory_import_batches batch on batch.id = issue.batch_id
      where issue.id = ${input.issueId}::uuid
        and issue.batch_id = ${input.batchId}::uuid
      for update
    `;
    if (!issue) {
      throw new InventoryImportPersistenceError("ISSUE_NOT_FOUND", "Importbevinding niet gevonden.");
    }
    if (issue.batch_status === "applied" || issue.batch_status === "failed") {
      throw new InventoryImportPersistenceError(
        "IMPORT_LOCKED",
        "Deze import kan niet meer worden gewijzigd.",
      );
    }

    const resolution = validateImportResolution(
      issue,
      input.resolutionAction,
      input.correctedValue,
    );
    if (!issue.import_row_id) {
      throw new InventoryImportPersistenceError(
        "ROW_NOT_FOUND",
        "De bronrij van deze bevinding ontbreekt.",
      );
    }
    await applyRowResolution(
      transaction,
      issue.import_row_id,
      issue.field,
      resolution.action,
      resolution.correctedValue,
    );

    if (resolution.action === "reject_row") {
      await transaction`
        update inventory_import_issues
        set
          resolved = true,
          resolution_note = ${input.resolutionNote},
          resolution_action = 'reject_row',
          corrected_value = null,
          resolved_by = ${input.actorId}::uuid,
          resolved_at = now()
        where import_row_id = ${issue.import_row_id}::uuid
          and batch_id = ${input.batchId}::uuid
      `;
    } else {
      await transaction`
        update inventory_import_issues
        set
          resolved = ${input.resolved},
          resolution_note = ${input.resolutionNote},
          resolution_action = ${resolution.action},
          corrected_value = ${resolution.correctedValue},
          resolved_by = ${input.actorId}::uuid,
          resolved_at = case when ${input.resolved} then now() else null end
        where id = ${input.issueId}::uuid
      `;
    }

    const [open] = await transaction<{
      total: number;
      blockers: number;
    }[]>`
      select
        count(*) filter (where not resolved)::integer as total,
        count(*) filter (
          where not resolved and severity in ('error', 'review')
        )::integer as blockers
      from inventory_import_issues
      where batch_id = ${input.batchId}::uuid
    `;
    const status = open.blockers > 0 ? "needs_review" : "ready";

    await transaction`
      update inventory_import_batches
      set status = ${status}
      where id = ${input.batchId}::uuid
    `;
    await transaction`
      insert into audit_logs (
        actor_id,
        action,
        entity_type,
        entity_id,
        after_data
      )
      values (
        ${input.actorId}::uuid,
        ${input.resolved ? "inventory_import_issue_resolved" : "inventory_import_issue_reopened"},
        'inventory_import_issue',
        ${input.issueId},
        ${transaction.json({
          batchId: input.batchId,
          resolved: input.resolved,
          resolutionNote: input.resolutionNote,
          resolutionAction: resolution.action,
          correctedValue: resolution.correctedValue,
        })}
      )
    `;

    return {
      batchId: input.batchId,
      issueId: input.issueId,
      resolved: input.resolved,
      resolutionAction: resolution.action,
      correctedValue: resolution.correctedValue,
      status,
      openIssueCount: open.total,
    };
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

type ImportReviewBatch = Omit<ImportBatchResult, "duplicate"> & {
  fileName: string;
  importedAt: Date;
};

export type ImportReviewIssue = {
  issueId: string;
  severity: "error" | "warning" | "review";
  field: string;
  code: string;
  message: string;
  resolved: boolean;
  resolutionNote: string | null;
  resolutionAction: ResolutionAction | null;
  correctedValue: string | null;
  resolvedAt: Date | null;
  sourceRow: number | null;
  storageNumber: number | null;
  model: string | null;
  quantity: number | null;
  layout: string | null;
  sku: string | null;
  linkedModels: string | null;
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
  if (error instanceof InventoryResolutionError) {
    return { status: 422, body: { error: error.code, message: error.message } };
  }
  if (error instanceof InventoryImportPersistenceError) {
    const status = error.code === "IMPORT_LOCKED" ? 409 : 404;
    return { status, body: { error: error.code, message: error.message } };
  }
  if (error instanceof AuthorizationError) {
    return { status: 403, body: { error: error.code, message: error.message } };
  }
  throw error;
}

export class InventoryImportPersistenceError extends Error {
  constructor(
    public readonly code: "IMPORT_NOT_FOUND" | "ISSUE_NOT_FOUND" | "IMPORT_LOCKED" | "ROW_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "InventoryImportPersistenceError";
  }
}

async function applyRowResolution(
  transaction: TransactionSql,
  rowId: string,
  field: string,
  action: ResolutionAction,
  correctedValue: string | null,
) {
  if (action === "reject_row") {
    await transaction`
      update inventory_import_rows
      set resolution_status = 'rejected'
      where id = ${rowId}::uuid
    `;
    return;
  }
  if (action !== "correct_value" || correctedValue === null) return;

  if (field === "sku") {
    await transaction`
      update inventory_import_rows set sku = ${correctedValue}
      where id = ${rowId}::uuid
    `;
  } else if (field === "storageNumber") {
    await transaction`
      update inventory_import_rows set source_number = ${Number(correctedValue)}
      where id = ${rowId}::uuid
    `;
  } else if (field === "quantity") {
    await transaction`
      update inventory_import_rows set quantity = ${Number(correctedValue)}
      where id = ${rowId}::uuid
    `;
  } else if (field === "layout") {
    await transaction`
      update inventory_import_rows set layout_name = ${correctedValue}
      where id = ${rowId}::uuid
    `;
  } else if (field === "linkedModels") {
    await transaction`
      update inventory_import_rows set linked_models_text = ${correctedValue}
      where id = ${rowId}::uuid
    `;
  } else if (field === "model") {
    await transaction`
      update inventory_import_rows
      set
        model_name = ${correctedValue},
        normalized_model_name = ${correctedValue.toLowerCase()}
      where id = ${rowId}::uuid
    `;
  }
}
