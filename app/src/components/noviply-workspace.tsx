"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-catalog";
import {
  calculateCatalogThreshold,
  inventoryQuantity,
} from "@/domain/inventory-quantities";
import { layoutWithCountry } from "@/domain/operations";
import {
  printRequestStatusLabel,
  printRequestTotals,
  type PrintRequestRecord,
  type PrintRequestStatus,
} from "@/domain/print-requests";

export type NoviplyTab = "orders" | "stock";

type Props = {
  tab: NoviplyTab;
  printRequests: PrintRequestRecord[];
  quantities: Record<string, number>;
  onSettlePrintRequest: (
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
  ) => void;
};

function formatMoment(value: string) {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  return moment.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NoviplyWorkspace({
  tab,
  printRequests,
  quantities,
  onSettlePrintRequest,
}: Props) {
  const [blockedId, setBlockedId] = useState("");
  const [blockedNote, setBlockedNote] = useState("");
  const [message, setMessage] = useState("");

  const totals = printRequestTotals(printRequests);
  const open = printRequests
    .filter((request) => request.status === "requested")
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  const handled = printRequests
    .filter((request) => request.status !== "requested")
    .sort((left, right) => (right.handledAt ?? "").localeCompare(left.handledAt ?? ""))
    .slice(0, 25);

  /** Wat bijna op is, moet Noviply nazenden. Alleen dat is hier relevant. */
  const running = useMemo(() => inventoryCatalog
    .filter((item) => item.dataQuality === "ready")
    .map((item) => {
      const stock = inventoryQuantity(quantities, item);
      const threshold = calculateCatalogThreshold(
        item.averageWeeklyDemand,
        item.leadTimeDays,
        item.safetyStockWeeks,
      );
      return { item, stock, threshold, shortfall: threshold - stock };
    })
    .filter((row) => row.shortfall > 0)
    .sort((left, right) => right.shortfall - left.shortfall)
    .slice(0, 25), [quantities]);

  function settle(
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
  ) {
    try {
      onSettlePrintRequest(record, status, note);
      setBlockedId("");
      setBlockedNote("");
      setMessage(status === "printed"
        ? `${record.model} marked as printed.`
        : `${record.model} reported as not printable.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saving failed.");
    }
  }

  return (
    <div className="noviply-workspace">
      <div className="noviply-totals">
        <article>
          <span>TO DO</span>
          <strong className={totals.open > 0 ? "attention" : ""}>{totals.open}</strong>
          <small>requests waiting to be printed</small>
        </article>
        <article>
          <span>PRINTED</span>
          <strong>{totals.printed}</strong>
          <small>completed in this pilot</small>
        </article>
        <article>
          <span>CANNOT PRINT</span>
          <strong>{totals.notPrintable}</strong>
          <small>with a stated reason</small>
        </article>
        <article>
          <span>RESUPPLY</span>
          <strong className={running.length > 0 ? "attention" : ""}>{running.length}</strong>
          <small>folders below their minimum</small>
        </article>
      </div>

      {tab === "orders" && (
      <section className="noviply-panel">
        <div className="noviply-panel-head">
          <div>
            <h3>Print request list</h3>
            <p>
              The morning run for foreign orders is automatic. This list only holds
              the extras — a layout that does not match, or an older order coming
              past again.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Brand / model</th>
                <th>Language</th>
                <th>Enter</th>
                <th>Order number</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {open.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.brand}</strong><span>{request.model}</span></td>
                  <td>{request.layout}</td>
                  <td>{request.variant || "—"}</td>
                  <td>{request.orderReference || "—"}</td>
                  <td>
                    <strong>{formatMoment(request.requestedAt)}</strong>
                    <span>{request.reason || request.requestedBy}</span>
                  </td>
                  <td>
                    {blockedId === request.id ? (
                      <div className="noviply-blocked">
                        <input
                          value={blockedNote}
                          onChange={(event) => setBlockedNote(event.target.value)}
                          placeholder="Why can this not be printed?"
                          maxLength={200}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="danger-ghost-button"
                          onClick={() => settle(request, "not_printable", blockedNote)}
                        >
                          Report
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBlockedId(""); setBlockedNote(""); }}
                        >
                          Back
                        </button>
                      </div>
                    ) : (
                      <div className="noviply-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => settle(request, "printed", "")}
                        >
                          Printed
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBlockedId(request.id); setBlockedNote(""); }}
                        >
                          Cannot print
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {open.length === 0 && (
            <div className="empty">Nothing extra requested. The morning run covers everything.</div>
          )}
        </div>
        {message && <div className="policy-saved" role="status">{message}</div>}
      </section>
      )}

      {tab === "stock" && (
      <section className="noviply-panel">
        <div className="noviply-panel-head">
          <div>
            <h3>Stock running low</h3>
            <p>Folders whose stock has dropped below the calculated minimum.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Folder</th>
                <th>Part number</th>
                <th>Layout</th>
                <th>Stock</th>
                <th>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {running.map(({ item, stock, threshold, shortfall }) => (
                <tr key={item.catalogKey}>
                  <td><strong className="storage-number">No. {item.storageNumber}</strong><span>{item.model}</span></td>
                  <td>{item.sku}</td>
                  <td>{layoutWithCountry(item.layout, item.sku)}</td>
                  <td><b className={stock === 0 ? "zero" : ""}>{stock}</b><span> / min. {threshold}</span></td>
                  <td><strong>{shortfall}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {running.length === 0 && (
            <div className="empty">All folders are above their minimum.</div>
          )}
        </div>
      </section>
      )}

      {tab === "orders" && (
        <section className="noviply-panel">
          <div className="noviply-panel-head">
            <div><h3>History</h3><p>Everything you tick off stays here, with the time.</p></div>
          </div>
          <div className="table-wrap">
            <table className="operations-table">
              <thead>
                <tr><th>Brand / model</th><th>Language</th><th>Outcome</th><th>Handled</th></tr>
              </thead>
              <tbody>
                {handled.map((request) => (
                  <tr key={request.id}>
                    <td><strong>{request.brand}</strong><span>{request.model}</span></td>
                    <td>{request.layout}</td>
                    <td>
                      <span className={`print-status ${request.status}`}>
                        {request.status === "printed" ? "✓" : "✕"} {printRequestStatusLabel(request.status)}
                      </span>
                      {request.note && <span>{request.note}</span>}
                    </td>
                    <td>{request.handledAt ? formatMoment(request.handledAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {handled.length === 0 && (
              <div className="empty">Nothing ticked off yet in this pilot.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
