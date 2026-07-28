import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const recordStatus = pgEnum("record_status", ["active", "inactive", "phasing_out"]);
export const compatibilityStatus = pgEnum("compatibility_status", ["unverified", "tested", "conditional", "rejected"]);
export const transactionType = pgEnum("inventory_transaction_type", ["opening", "issue", "receipt", "transfer_out", "transfer_in", "adjustment", "reservation", "release"]);
export const conversionJobStatus = pgEnum("conversion_job_status", ["draft", "advised", "released", "in_progress", "quality_check", "completed", "blocked", "cancelled"]);
export const qualityResult = pgEnum("quality_result", ["passed", "rework", "scrap", "blocked"]);
export const stickerVerificationOutcome = pgEnum("sticker_verification_outcome", ["passed", "blocked_unused", "scrapped"]);
export const keyboardReferenceStatus = pgEnum("keyboard_reference_status", ["draft", "approved", "rejected"]);
export const stockCountStatus = pgEnum("stock_count_status", ["open", "completed", "cancelled"]);
export const modelGroupProposalStatus = pgEnum("model_group_proposal_status", ["pending", "approved", "rejected", "superseded"]);
export const modelGroupReviewDecision = pgEnum("model_group_review_decision", ["approved", "rejected"]);
export const recoveryDrillResult = pgEnum("recovery_drill_result", ["passed", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id").notNull(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_external_id_uq").on(table.externalId),
  uniqueIndex("users_email_uq").on(table.email),
]);

export const manufacturers = pgTable("manufacturers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
}, (table) => [uniqueIndex("manufacturers_name_uq").on(table.name)]);

export const laptopModels = pgTable("laptop_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  manufacturerId: uuid("manufacturer_id").notNull().references(() => manufacturers.id),
  family: text("family"),
  modelName: text("model_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  status: recordStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("laptop_models_normalized_name_uq").on(table.normalizedName)]);

export const modelAliases = pgTable("model_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelId: uuid("model_id").notNull().references(() => laptopModels.id),
  alias: text("alias").notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
  source: text("source").notNull().default("manual"),
}, (table) => [uniqueIndex("model_aliases_normalized_alias_uq").on(table.normalizedAlias)]);

export const keyboardLayouts = pgTable("keyboard_layouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  languageCode: text("language_code").notNull(),
  family: text("family"),
  exact: boolean("exact").notNull().default(true),
  identificationNotes: text("identification_notes"),
  active: boolean("active").notNull().default(true),
}, (table) => [uniqueIndex("keyboard_layouts_code_uq").on(table.code)]);

export const keyboardLayoutReferences = pgTable("keyboard_layout_references", {
  id: uuid("id").primaryKey().defaultRandom(),
  layoutId: uuid("layout_id").references(() => keyboardLayouts.id),
  modelId: uuid("model_id").references(() => laptopModels.id),
  variantCode: text("variant_code"),
  referenceType: text("reference_type").notNull(),
  assetUrl: text("asset_url"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  status: keyboardReferenceStatus("status").notNull().default("draft"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stickerSkus = pgTable("sticker_skus", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  layoutId: uuid("layout_id").notNull().references(() => keyboardLayouts.id),
  methodCode: text("method_code").notNull(),
  barcode: text("barcode"),
  hangingFileNumber: integer("hanging_file_number"),
  status: recordStatus("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sticker_skus_sku_uq").on(table.sku),
  uniqueIndex("sticker_skus_barcode_uq").on(table.barcode),
  uniqueIndex("sticker_skus_hanging_file_number_uq").on(table.hangingFileNumber),
  check("sticker_skus_hanging_file_number_positive", sql`${table.hangingFileNumber} is null or ${table.hangingFileNumber} > 0`),
]);

export const skuModelCompatibility = pgTable("sku_model_compatibility", {
  skuId: uuid("sku_id").notNull().references(() => stickerSkus.id),
  modelId: uuid("model_id").notNull().references(() => laptopModels.id),
  status: compatibilityStatus("status").notNull().default("unverified"),
  notes: text("notes"),
  source: text("source"),
  testedAt: timestamp("tested_at", { withTimezone: true }),
  testedBy: uuid("tested_by").references(() => users.id),
}, (table) => [primaryKey({ columns: [table.skuId, table.modelId] })]);

export const modelGroupProposals = pgTable("model_group_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  suggestionKey: text("suggestion_key").notNull(),
  proposedName: text("proposed_name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  skuId: uuid("sku_id").references(() => stickerSkus.id),
  layoutId: uuid("layout_id").references(() => keyboardLayouts.id),
  variantCode: text("variant_code"),
  candidateModels: jsonb("candidate_models").notNull(),
  sourceEvidence: jsonb("source_evidence").notNull(),
  riskFlags: jsonb("risk_flags").notNull(),
  confidence: integer("confidence").notNull(),
  source: text("source").notNull().default("catalog_assistant"),
  status: modelGroupProposalStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("model_group_proposals_suggestion_key_uq").on(table.suggestionKey),
  check("model_group_proposals_confidence_range", sql`${table.confidence} between 0 and 100`),
]);

export const modelGroupReviews = pgTable("model_group_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").notNull().references(() => modelGroupProposals.id),
  idempotencyKey: text("idempotency_key").notNull(),
  decision: modelGroupReviewDecision("decision").notNull(),
  manufacturerPartNumber: text("manufacturer_part_number"),
  photoReference: text("photo_reference"),
  evidence: jsonb("evidence").notNull(),
  notes: text("notes"),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("model_group_reviews_idempotency_key_uq").on(table.idempotencyKey),
]);

export const compatibilityEvidence = pgTable("compatibility_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull(),
  catalogKey: text("catalog_key").notNull(),
  skuId: uuid("sku_id").notNull().references(() => stickerSkus.id),
  modelId: uuid("model_id").notNull().references(() => laptopModels.id),
  status: keyboardReferenceStatus("status").notNull(),
  variantCode: text("variant_code").notNull(),
  manufacturerPartNumber: text("manufacturer_part_number").notNull(),
  photoReference: text("photo_reference").notNull(),
  keyboardWidthMm: integer("keyboard_width_mm").notNull(),
  keyboardHeightMm: integer("keyboard_height_mm").notNull(),
  checkpoints: jsonb("checkpoints").notNull(),
  notes: text("notes"),
  reviewedBy: uuid("reviewed_by").notNull().references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("compatibility_evidence_idempotency_key_uq").on(table.idempotencyKey),
  check("compatibility_evidence_width_range", sql`${table.keyboardWidthMm} between 150 and 500`),
  check("compatibility_evidence_height_range", sql`${table.keyboardHeightMm} between 50 and 250`),
]);

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  barcode: text("barcode"),
  active: boolean("active").notNull().default(true),
}, (table) => [
  uniqueIndex("locations_code_uq").on(table.code),
  uniqueIndex("locations_barcode_uq").on(table.barcode),
]);

export const inventoryBalances = pgTable("inventory_balances", {
  skuId: uuid("sku_id").notNull().references(() => stickerSkus.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  onHand: integer("on_hand").notNull().default(0),
  reserved: integer("reserved").notNull().default(0),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.skuId, table.locationId] }),
  check("inventory_balances_on_hand_nonnegative", sql`${table.onHand} >= 0`),
  check("inventory_balances_reserved_nonnegative", sql`${table.reserved} >= 0`),
]);

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skuId: uuid("sku_id").notNull().references(() => stickerSkus.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  type: transactionType("type").notNull(),
  quantityDelta: integer("quantity_delta").notNull(),
  reasonCode: text("reason_code").notNull(),
  notes: text("notes"),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull(),
  performedBy: uuid("performed_by").notNull().references(() => users.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inventory_transactions_idempotency_uq").on(table.idempotencyKey),
  check("inventory_transactions_delta_nonzero", sql`${table.quantityDelta} <> 0`),
]);

export const inventorySourceSnapshots = pgTable("inventory_source_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceSha256: text("source_sha256").notNull(),
  fileName: text("file_name").notNull(),
  sheetName: text("sheet_name").notNull(),
  rowCount: integer("row_count").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  status: text("status").notNull().default("prepared"),
  importedBy: uuid("imported_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("inventory_source_snapshots_source_sha256_uq").on(table.sourceSha256),
  check("inventory_source_snapshots_row_count_positive", sql`${table.rowCount} > 0`),
  check("inventory_source_snapshots_quantity_nonnegative", sql`${table.totalQuantity} >= 0`),
  check(
    "inventory_source_snapshots_status_valid",
    sql`${table.status} in ('prepared', 'applied', 'failed')`,
  ),
  check(
    "inventory_source_snapshots_sha256_valid",
    sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`,
  ),
]);

export const inventorySourceRows = pgTable("inventory_source_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotId: uuid("snapshot_id").notNull()
    .references(() => inventorySourceSnapshots.id, { onDelete: "cascade" }),
  sourceRow: integer("source_row").notNull(),
  catalogKey: text("catalog_key").notNull(),
  hangingFileNumber: integer("hanging_file_number").notNull(),
  modelName: text("model_name").notNull(),
  layoutText: text("layout_text").notNull(),
  skuText: text("sku_text").notNull(),
  openingQuantity: integer("opening_quantity").notNull(),
  linkedModels: jsonb("linked_models").notNull().default([]),
  notes: text("notes"),
  dataQuality: text("data_quality").notNull(),
  dataQualityIssues: jsonb("data_quality_issues").notNull().default([]),
  skuId: uuid("sku_id").references(() => stickerSkus.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("inventory_source_rows_snapshot_source_row_uq")
    .on(table.snapshotId, table.sourceRow),
  uniqueIndex("inventory_source_rows_snapshot_catalog_key_uq")
    .on(table.snapshotId, table.catalogKey),
  uniqueIndex("inventory_source_rows_snapshot_hanging_file_uq")
    .on(table.snapshotId, table.hangingFileNumber),
  check("inventory_source_rows_source_row_positive", sql`${table.sourceRow} > 0`),
  check(
    "inventory_source_rows_hanging_file_positive",
    sql`${table.hangingFileNumber} > 0`,
  ),
  check(
    "inventory_source_rows_quantity_nonnegative",
    sql`${table.openingQuantity} >= 0`,
  ),
  check(
    "inventory_source_rows_quality_valid",
    sql`${table.dataQuality} in ('ready', 'blocked')`,
  ),
]);

export const stockCounts = pgTable("stock_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  status: stockCountStatus("status").notNull().default("open"),
  startedBy: uuid("started_by").notNull().references(() => users.id),
  completedBy: uuid("completed_by").references(() => users.id),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const stockCountLines = pgTable("stock_count_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  countId: uuid("count_id").notNull().references(() => stockCounts.id),
  idempotencyKey: text("idempotency_key").notNull(),
  skuId: uuid("sku_id").references(() => stickerSkus.id),
  hangingFileNumber: integer("hanging_file_number").notNull(),
  sourceSkuText: text("source_sku_text"),
  expectedQuantity: integer("expected_quantity").notNull(),
  countedQuantity: integer("counted_quantity").notNull(),
  difference: integer("difference").notNull(),
  reasonCode: text("reason_code"),
  notes: text("notes"),
  inventoryTransactionId: uuid("inventory_transaction_id").references(() => inventoryTransactions.id),
  countedBy: uuid("counted_by").notNull().references(() => users.id),
  countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("stock_count_lines_count_hanging_file_uq").on(table.countId, table.hangingFileNumber),
  uniqueIndex("stock_count_lines_idempotency_uq").on(table.idempotencyKey),
  check("stock_count_lines_hanging_file_positive", sql`${table.hangingFileNumber} > 0`),
  check("stock_count_lines_expected_nonnegative", sql`${table.expectedQuantity} >= 0`),
  check("stock_count_lines_counted_nonnegative", sql`${table.countedQuantity} >= 0`),
]);

export const conversionMethods = pgTable("conversion_methods", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  status: recordStatus("status").notNull().default("active"),
  qualityTier: integer("quality_tier").notNull(),
  requiresQualityCheck: boolean("requires_quality_check").notNull().default(false),
});

export const conversionPolicies = pgTable("conversion_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull(),
  thresholdEur: numeric("threshold_eur", { precision: 10, scale: 2 }).notNull(),
  rules: jsonb("rules").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("conversion_policies_version_uq").on(table.version)]);

export const conversionJobs = pgTable("conversion_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  laptopModelId: uuid("laptop_model_id").notNull().references(() => laptopModels.id),
  externalLaptopId: text("external_laptop_id"),
  orderReference: text("order_reference"),
  currentLayoutId: uuid("current_layout_id").notNull().references(() => keyboardLayouts.id),
  targetLayoutId: uuid("target_layout_id").notNull().references(() => keyboardLayouts.id),
  saleValueEur: numeric("sale_value_eur", { precision: 10, scale: 2 }).notNull(),
  saleValueBand: text("sale_value_band"),
  modelLookupQuery: text("model_lookup_query"),
  advisedMethodCode: text("advised_method_code").notNull().references(() => conversionMethods.code),
  chosenMethodCode: text("chosen_method_code").references(() => conversionMethods.code),
  selectedStickerSkuId: uuid("selected_sticker_sku_id").references(() => stickerSkus.id),
  policyId: uuid("policy_id").notNull().references(() => conversionPolicies.id),
  overrideReason: text("override_reason"),
  status: conversionJobStatus("status").notNull().default("draft"),
  operatorId: uuid("operator_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const operationsSettings = pgTable("operations_settings", {
  settingKey: text("setting_key").primaryKey(),
  thresholdEur: numeric("threshold_eur", { precision: 10, scale: 2 }).notNull(),
  workload: text("workload").notNull(),
  methodEnabled: jsonb("method_enabled").notNull(),
  employeePermissions: jsonb("employee_permissions").notNull(),
  abcAThreshold: integer("abc_a_threshold").notNull(),
  abcBThreshold: integer("abc_b_threshold").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const qualityChecks = pgTable("quality_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => conversionJobs.id),
  result: qualityResult("result").notNull(),
  defectCode: text("defect_code"),
  notes: text("notes"),
  checkedBy: uuid("checked_by").notNull().references(() => users.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stickerVerificationReports = pgTable("sticker_verification_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => conversionJobs.id),
  orderReference: text("order_reference").notNull(),
  skuId: uuid("sku_id").notNull().references(() => stickerSkus.id),
  hangingFileNumber: integer("hanging_file_number").notNull(),
  modelName: text("model_name").notNull(),
  targetLayoutId: uuid("target_layout_id").notNull().references(() => keyboardLayouts.id),
  variant: text("variant").notNull(),
  outcome: stickerVerificationOutcome("outcome").notNull(),
  failureReason: text("failure_reason"),
  inventoryTransactionId: uuid("inventory_transaction_id").references(() => inventoryTransactions.id),
  checkedBy: uuid("checked_by").notNull().references(() => users.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("sticker_verification_hanging_file_number_positive", sql`${table.hangingFileNumber} > 0`),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  correlationId: uuid("correlation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recoveryDrills = pgTable("recovery_drills", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: text("idempotency_key").notNull(),
  backupReference: text("backup_reference").notNull(),
  targetEnvironment: text("target_environment").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  rpoMinutes: integer("rpo_minutes").notNull(),
  rtoMinutes: integer("rto_minutes").notNull(),
  checks: jsonb("checks").notNull(),
  result: recoveryDrillResult("result").notNull(),
  notes: text("notes"),
  performedBy: uuid("performed_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("recovery_drills_idempotency_uq").on(table.idempotencyKey),
  check(
    "recovery_drills_target_environment_valid",
    sql`${table.targetEnvironment} in ('staging', 'recovery')`,
  ),
  check("recovery_drills_time_range_valid", sql`${table.completedAt} >= ${table.startedAt}`),
  check("recovery_drills_rpo_nonnegative", sql`${table.rpoMinutes} >= 0`),
  check("recovery_drills_rto_nonnegative", sql`${table.rtoMinutes} >= 0`),
  check("recovery_drills_checks_object", sql`jsonb_typeof(${table.checks}) = 'object'`),
]);
