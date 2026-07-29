import "server-only";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { listConversionLog } from "./conversion-log-service";
import { listPrintRequests } from "./print-request-service";
import { readOperationsPolicy } from "./operations-policy-service";
import { readSkuOverrides } from "./sku-override-service";
import {
  listCompatibilityEvidence,
  listModelGroupDecisions,
  listStockCounts,
} from "./shared-history-service";

/**
 * Alles wat de schermen bij het openen nodig hebben, in één antwoord. Vier losse
 * verzoeken zouden elkaar kunnen kruisen en een half beeld opleveren; dit is een
 * momentopname die bij elkaar hoort.
 */

function catalogKeyFor(hangingFileNumber: number) {
  return `hangmap-${String(hangingFileNumber).padStart(3, "0")}`;
}

type BalanceRow = { hanging_file_number: number; on_hand: number };

type TransactionRow = {
  id: string;
  occurred_at: Date;
  hanging_file_number: number;
  sku: string;
  name: string;
  type: "opening" | "issue" | "receipt" | "adjustment" | string;
  quantity_delta: number;
  reason_code: string;
  notes: string | null;
  actor_name: string;
  reference_type: string | null;
};

/** De naam is "model · layout · variant"; de schermen tonen model en layout apart. */
function splitName(name: string) {
  const [model = "", layout = ""] = name.split("·").map((part) => part.trim());
  return { model, layout };
}

export async function readOperationsState(actorId: string) {
  await requirePermission(actorId, "inventory.view");
  const sql = database();

  const [
    balances,
    transactions,
    printRequests,
    conversionLog,
    policy,
    skuOverrides,
    stockCounts,
    modelGroupDecisions,
    compatibilityEvidenceRecords,
  ] = await Promise.all([
    sql<BalanceRow[]>`
      select s.hanging_file_number, b.on_hand
      from inventory_balances b
      join sticker_skus s on s.id = b.sku_id
      where s.hanging_file_number is not null
    `,
    sql<TransactionRow[]>`
      select
        t.id, t.occurred_at, t.type, t.quantity_delta, t.reason_code, t.notes,
        t.reference_type, s.hanging_file_number, s.sku, s.name,
        u.display_name as actor_name
      from inventory_transactions t
      join sticker_skus s on s.id = t.sku_id
      join users u on u.id = t.performed_by
      where t.occurred_at > now() - make_interval(days => 190)
      order by t.occurred_at desc
      limit 5000
    `,
    listPrintRequests(actorId),
    listConversionLog(actorId),
    readOperationsPolicy(),
    readSkuOverrides(),
    listStockCounts(),
    listModelGroupDecisions(),
    listCompatibilityEvidence(),
  ]);

  const catalogQuantities: Record<string, number> = {};
  for (const balance of balances) {
    catalogQuantities[catalogKeyFor(balance.hanging_file_number)] = balance.on_hand;
  }

  return {
    savedAt: new Date().toISOString(),
    catalogQuantities,
    transactions: transactions.map((row) => {
      const { model, layout } = splitName(row.name);
      return {
        id: row.id,
        occurredAt: row.occurred_at.toISOString(),
        catalogKey: catalogKeyFor(row.hanging_file_number),
        storageNumber: row.hanging_file_number,
        sku: row.sku,
        model,
        layout,
        // De beginstand is geen dagwerk maar een openingssaldo. Als "receipt"
        // zou hij in het verbruiksverloop opduiken als een levering die nooit
        // heeft plaatsgevonden; `aggregated` houdt hem uit de dagcijfers.
        type: row.type === "opening" ? ("receipt" as const) : (row.type as "issue" | "receipt" | "adjustment"),
        aggregated: row.type === "opening" ? true : undefined,
        quantityDelta: row.quantity_delta,
        reasonCode: row.reason_code,
        notes: row.notes ?? undefined,
        actor: row.actor_name,
        reference: row.reference_type ?? undefined,
      };
    }),
    printRequests,
    conversionLog,
    operationsPolicy: policy?.policy ?? null,
    operationsPolicyVersion: policy?.version ?? 0,
    directPrintLayouts: policy?.directPrintLayouts ?? [],
    skuOverrides,
    stockCounts,
    modelGroupDecisions,
    compatibilityEvidenceRecords,
  };
}
