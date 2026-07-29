"use client";

/**
 * De verbinding tussen de schermen en de gedeelde database.
 *
 * Elke schrijfactie draagt een idempotentiesleutel. Dat is niet voor de
 * netheid: een medewerker met een haperende verbinding drukt nog eens, en de
 * wachtrij hieronder probeert het later nog eens. Zonder die sleutel zou één
 * laptop twee vellen kosten.
 */

import type { ConversionLogEntry } from "@/domain/conversion-log";
import type { CompatibilityEvidenceRecord } from "@/domain/compatibility-evidence";
import type { StockCountRecord } from "@/domain/cycle-count";
import type { ModelGroupDecision } from "@/domain/model-grouping";
import type { InventoryTransactionEntry, OperationsPolicy } from "@/domain/operations";
import type { PrintRequestRecord, PrintRequestStatus } from "@/domain/print-requests";
import type { PrinterCheckRecord } from "@/domain/printer-check";
import type { StickerVerificationReport } from "@/domain/sticker-verification";

export type SharedOperationsState = {
  savedAt: string;
  catalogQuantities: Record<string, number>;
  transactions: InventoryTransactionEntry[];
  printRequests: PrintRequestRecord[];
  conversionLog: ConversionLogEntry[];
  operationsPolicy: OperationsPolicy | null;
  /** Waarmee we merken dat iemand anders het beleid ondertussen aanpaste. */
  operationsPolicyVersion: number;
  /** Layouts die de toetsenbordsprinter aankan; leeg = nog niet ingevuld. */
  directPrintLayouts: string[];
  skuOverrides: Record<string, string>;
  stockCounts: StockCountRecord[];
  modelGroupDecisions: ModelGroupDecision[];
  compatibilityEvidenceRecords: CompatibilityEvidenceRecord[];
  printerChecks: PrinterCheckRecord[];
  verificationReports: StickerVerificationReport[];
  /** Vellen die na de Excel-import zijn toegevoegd. */
  addedSheets: AddedSheet[];
};

export type AddedSheet = {
  catalogKey: string;
  storageNumber: number;
  sku: string;
  model: string;
  layout: string;
  stock: number;
};

/** Een fout die de gebruiker iets zegt, tegenover een verbinding die wegviel. */
export class KeyflowApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "KeyflowApiError";
  }
}

export class KeyflowOfflineError extends Error {
  constructor() {
    super("Geen verbinding met de server.");
    this.name = "KeyflowOfflineError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    // fetch faalt alleen bij een netwerkprobleem; alles anders komt terug met
    // een statuscode.
    throw new KeyflowOfflineError();
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new KeyflowApiError(
      body.message ?? "De server kon dit verzoek niet verwerken.",
      body.error ?? "UNKNOWN",
      response.status,
    );
  }
  return body as T;
}

export function fetchSharedState(actorId: string) {
  return request<SharedOperationsState>(
    `/api/operations/state?actorId=${encodeURIComponent(actorId)}`,
    { cache: "no-store" },
  );
}

export type MutationPayload = {
  sku: string;
  locationCode: string;
  type: "issue" | "receipt";
  quantity: number;
  reasonCode: string;
  notes?: string;
  reference?: string;
  idempotencyKey: string;
  actorId: string;
};

export function postInventoryMutation(payload: MutationPayload) {
  return request<{
    transactionId: string;
    quantityDelta: number;
    newQuantity: number;
    duplicate: boolean;
  }>("/api/inventory/mutations", { method: "POST", body: JSON.stringify(payload) });
}

export type PrintRequestPayload = {
  model: string;
  layout: string;
  variant: string;
  orderReference: string;
  reason: string;
  idempotencyKey: string;
  actorId: string;
};

export function postPrintRequest(payload: PrintRequestPayload) {
  return request<{ record: PrintRequestRecord; duplicate: boolean }>(
    "/api/print-requests",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function patchPrintRequest(
  id: string,
  payload: {
    status: Exclude<PrintRequestStatus, "requested">;
    note: string;
    actorId: string;
  },
) {
  return request<{ record: PrintRequestRecord; alreadySettled: boolean }>(
    `/api/print-requests/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export type ConversionPayload = {
  method: string;
  status: "completed" | "awaiting_print";
  model: string;
  targetLayout: string;
  variant: string;
  sku: string;
  storageNumber: number | null;
  orderReference: string;
  idempotencyKey: string;
  actorId: string;
};

export function postConversion(payload: ConversionPayload) {
  return request<{ entry: ConversionLogEntry; duplicate: boolean }>(
    "/api/conversions",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function putOperationsPolicy(payload: {
  policy: OperationsPolicy;
  directPrintLayouts: string[];
  expectedVersion: number;
  actorId: string;
}) {
  return request<{ policy: OperationsPolicy; directPrintLayouts: string[]; version: number }>(
    "/api/operations/policy",
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function putSkuOverride(payload: {
  catalogKey: string;
  sku: string;
  actorId: string;
}) {
  return request<{ catalogKey: string; sku: string }>(
    "/api/sku-overrides",
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function postStockCount(payload: Record<string, unknown>) {
  return request<{ duplicate: boolean; newQuantity: number }>(
    "/api/inventory/counts",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function postModelGroupReview(payload: Record<string, unknown>) {
  return request<{ duplicate: boolean }>(
    "/api/model-groups/reviews",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function postCompatibilityEvidence(payload: Record<string, unknown>) {
  return request<{ duplicate: boolean }>(
    "/api/compatibility/evidence",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/* ---------- toegang ---------- */

export type PilotAccount = { id: string; name: string; role: "management" | "noviply" };

export function fetchAccessRole() {
  return request<{
    userId: string;
    role: "employee" | "management" | "noviply";
    accounts: PilotAccount[];
  }>("/api/access", { cache: "no-store" });
}

export function signInWithPin(userId: string, pin: string) {
  return request<{
    userId: string;
    role: "management" | "noviply";
    name: string;
    mustChangePin: boolean;
  }>("/api/access", { method: "POST", body: JSON.stringify({ userId, pin }) });
}

export function changeOwnPin(currentPin: string, newPin: string) {
  return request<{ ok: true }>("/api/access/pin", {
    method: "POST",
    body: JSON.stringify({ currentPin, newPin }),
  });
}

export function createAccount(name: string, role: "management" | "noviply") {
  return request<{ id: string; name: string; role: string; temporaryPin: string }>(
    "/api/access/accounts",
    { method: "POST", body: JSON.stringify({ name, role }) },
  );
}

export function resetAccountPin(userId: string) {
  return request<{ temporaryPin: string }>("/api/access/accounts", {
    method: "PATCH",
    body: JSON.stringify({ userId }),
  });
}

export function removeAccount(userId: string) {
  return request<{ ok: true }>("/api/access/accounts", {
    method: "DELETE",
    body: JSON.stringify({ userId }),
  });
}

export function lockAccess() {
  return request<{ role: string }>("/api/access", { method: "DELETE" });
}

/* ---------- de printer bij ons, bediend vanuit Roemenië ---------- */

export function askPrinterCheck(question: string) {
  return request<{ check: PrinterCheckRecord; alreadyOpen: boolean }>(
    "/api/printer-checks",
    { method: "POST", body: JSON.stringify({ question }) },
  );
}

export function answerPrinterCheck(
  id: string,
  status: "ready" | "blocked",
  note: string,
) {
  return request<{ check: PrinterCheckRecord; alreadyAnswered: boolean }>(
    `/api/printer-checks/${id}`,
    { method: "PATCH", body: JSON.stringify({ status, note }) },
  );
}

export function postVerificationReport(payload: Record<string, unknown>) {
  return request<{ report: StickerVerificationReport }>("/api/verification-reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Noviply begint met printen; het antwoord van de werkvloer vervalt daarmee. */
export function closePrinterCheck(id: string) {
  return request<{ closed: true }>(`/api/printer-checks/${id}`, { method: "DELETE" });
}

/* ---------- een nieuw stickervel in de voorraad ---------- */

export function fetchNextStorageNumber() {
  return request<{ nextStorageNumber: number }>("/api/sticker-sheets", { cache: "no-store" });
}

export function addStickerSheet(payload: {
  storageNumber: number;
  sku: string;
  model: string;
  layout: string;
  quantity: number;
  notes: string;
  idempotencyKey: string;
}) {
  return request<{ duplicate: boolean; storageNumber: number; sku: string }>(
    "/api/sticker-sheets",
    { method: "POST", body: JSON.stringify(payload) },
  );
}
