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
