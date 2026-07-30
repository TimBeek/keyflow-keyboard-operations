"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-catalog";
import { inventoryQuantity } from "@/domain/inventory-quantities";
import {
  layoutWithCountry,
  type InventoryTransactionEntry,
} from "@/domain/operations";
import { dayKey } from "@/domain/reporting";
import {
  calculateResupplyLevel,
  measuredHistoryDays,
  minimumHistoryDays,
} from "@/domain/resupply";
import {
  printRequestStatusLabel,
  printRequestTotals,
  type PrintRequestRecord,
  type PrintRequestStatus,
} from "@/domain/print-requests";
import {
  createNoviplyPrintRequestCsv,
  createNoviplyStockCsv,
  noviplyExportFilename,
} from "@/domain/noviply-export";
import { displayStickerSku } from "@/domain/sticker-sku";
import {
  latestAnswered,
  openCheck,
  readyToPrint,
  type PrinterCheckRecord,
} from "@/domain/printer-check";

export type NoviplyTab = "orders" | "stock";

type Props = {
  tab: NoviplyTab;
  printRequests: PrintRequestRecord[];
  quantities: Record<string, number>;
  transactions: InventoryTransactionEntry[];
  printerChecks: PrinterCheckRecord[];
  resupplyLeadTimeDays: number;
  resupplySafetyWeeks: number;
  onAskPrinterCheck: () => void;
  onStartPrinting: (id: string) => void;
  onSettlePrintRequest: (
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
  ) => Promise<void>;
};

/** Overtypen in een ander systeem is werk dat fouten maakt. */
function downloadCsv(contents: string, filename: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
  transactions,
  printerChecks,
  resupplyLeadTimeDays,
  resupplySafetyWeeks,
  onAskPrinterCheck,
  onStartPrinting,
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

  /**
   * De volledige voorraad, van leeg naar vol. Noviply wil het geheel zien en
   * niet alleen een selectie; wat écht onder het minimum zit is gemarkeerd.
   */
  const today = useMemo(() => dayKey(new Date()), []);
  const historyDays = useMemo(
    () => measuredHistoryDays(transactions, today),
    [today, transactions],
  );

  const stockRows = useMemo(() => inventoryCatalog
    .filter((item) => item.dataQuality === "ready")
    .map((item) => {
      const stock = inventoryQuantity(quantities, item);
      // Het minimum volgt het gemeten verbruik: loopt een hangmap harder, dan
      // stijgt zijn minimum mee.
      const level = calculateResupplyLevel(
        transactions, item, stock, today, historyDays,
        resupplyLeadTimeDays, resupplySafetyWeeks,
      );
      return {
        item,
        stock,
        threshold: level?.minimum ?? null,
        shortfall: level?.shortfall ?? 0,
        weeklyDemand: level?.weeklyDemand ?? null,
      };
    })
    .sort((left, right) => right.shortfall - left.shortfall || left.stock - right.stock),
    [historyDays, quantities, resupplyLeadTimeDays, resupplySafetyWeeks, today, transactions]);
  const running = stockRows.filter((row) => row.shortfall > 0);
  const withKnownMinimum = stockRows.filter((row) => row.threshold !== null).length;
  const empty = stockRows.filter((row) => row.stock === 0).length;
  const measuring = historyDays < minimumHistoryDays;

  function exportStock() {
    const moment = new Date().toISOString();
    downloadCsv(
      createNoviplyStockCsv(stockRows.map(({ item, stock, threshold, shortfall }) => ({
        storageNumber: item.storageNumber,
        model: item.model,
        sku: item.sku,
        layout: layoutWithCountry(item.layout, item.sku),
        stock,
        threshold,
        shortfall,
      })), !measuring),
      noviplyExportFilename("stock", moment),
    );
    setMessage(`Downloaded ${stockRows.length} folders as a spreadsheet.`);
  }

  function exportPrintRequests() {
    const moment = new Date().toISOString();
    // Alles, niet alleen wat openstaat: hun eigen administratie wil de
    // afgehandelde regels er ook bij.
    downloadCsv(
      createNoviplyPrintRequestCsv([...printRequests].sort((left, right) =>
        left.requestedAt.localeCompare(right.requestedAt))),
      noviplyExportFilename("print-requests", moment),
    );
    setMessage(`Downloaded ${printRequests.length} requests as a spreadsheet.`);
  }

  async function settle(
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
  ) {
    try {
      await onSettlePrintRequest(record, status, note);
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
          <span>{withKnownMinimum === 0 ? "EMPTY FOLDERS" : "RESUPPLY"}</span>
          <strong className={(withKnownMinimum === 0 ? empty : running.length) > 0 ? "attention" : ""}>
            {withKnownMinimum === 0 ? empty : running.length}
          </strong>
          <small>{withKnownMinimum === 0
            ? "nothing left in these"
            : "folders below their minimum"}</small>
        </article>
      </div>

      {tab === "orders" && (
        <section className="noviply-panel printer-panel">
          <div className="printer-head">
            <div>
              <h3>Remote printer</h3>
              <p>
                The printer sits at ReMarkt. Only the floor can see whether it is
                loaded and switched on.
              </p>
            </div>
          </div>

          {(() => {
            const waiting = openCheck(printerChecks);
            const ready = readyToPrint(printerChecks);
            const answered = latestAnswered(printerChecks);

            if (waiting) {
              return (
                <div className="printer-state waiting">
                  <b>Waiting for the floor…</b>
                  <span>They have been asked. Their answer appears here.</span>
                </div>
              );
            }

            if (ready) {
              return (
                <div className="printer-state ready">
                  <div>
                    <b>✓ The printer is ready</b>
                    <span>{ready.answeredBy} · {formatMoment(ready.answeredAt ?? "")}</span>
                  </div>
                  {/* Zodra er geprint is vervalt het antwoord: laten staan zou
                      suggereren dat de printer nog klaarstaat. */}
                  <button
                    type="button"
                    className="printer-go"
                    onClick={() => onStartPrinting(ready.id)}
                  >
                    We are printing now
                  </button>
                </div>
              );
            }

            return (
              <>
                {answered && answered.status === "blocked" && (
                  <div className="printer-state blocked">
                    <div>
                      <b>✕ Not ready</b>
                      <span>{answered.answerNote}</span>
                      <small>{answered.answeredBy} · {formatMoment(answered.answeredAt ?? "")}</small>
                    </div>
                  </div>
                )}
                <button type="button" className="printer-ask" onClick={onAskPrinterCheck}>
                  <span className="printer-ask-icon" aria-hidden="true">?</span>
                  <span>
                    <b>Ask the floor if the printer is ready</b>
                    <small>They get a message straight away</small>
                  </span>
                </button>
              </>
            );
          })()}
        </section>
      )}

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
          <button
            type="button"
            className="secondary-button"
            onClick={exportPrintRequests}
            disabled={printRequests.length === 0}
          >
            Download for Excel
          </button>
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
            <h3>{measuring ? "Stock" : "Stock running low"}</h3>
            <p>
              {measuring
                ? `The whole cabinet, emptiest first. Minimum levels come later: they follow measured usage, and that takes ${historyDays} of ${minimumHistoryDays} days so far.`
                : `Sorted by what needs restocking first. A minimum covers the ${resupplyLeadTimeDays}-day delivery time plus one week spare, based on measured usage.`}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={exportStock}
            disabled={stockRows.length === 0}
          >
            Download for Excel
          </button>
        </div>
        <div className="table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Folder</th>
                <th>Part number</th>
                <th>Layout</th>
                {!measuring && <th>Used</th>}
                <th>Stock</th>
                {!measuring && <th>Shortfall</th>}
              </tr>
            </thead>
            <tbody>
              {stockRows.map(({ item, stock, threshold, shortfall, weeklyDemand }) => (
                <tr key={item.catalogKey} className={shortfall > 0 ? "stock-low" : ""}>
                  <td><strong className="storage-number">No. {item.storageNumber}</strong><span>{item.model}</span></td>
                  <td>{displayStickerSku(item.sku)}</td>
                  <td>{layoutWithCountry(item.layout, item.sku)}</td>
                  {!measuring && (
                    <td>{weeklyDemand === null
                      ? "—"
                      : `${weeklyDemand.toLocaleString("en-GB", { maximumFractionDigits: 1 })}/wk`}</td>
                  )}
                  <td>
                    <b className={stock === 0 ? "zero" : ""}>{stock}</b>
                    {!measuring && (
                      <span>{threshold === null ? "no minimum yet" : ` / min. ${threshold}`}</span>
                    )}
                    {measuring && stock === 0 && <span>empty</span>}
                  </td>
                  {!measuring && (
                    <td>
                      {threshold === null
                        ? <span className="stock-unknown">{stock === 0 ? "Empty" : "—"}</span>
                        : shortfall > 0
                          ? <span className="resupply-flag">Resupply {shortfall}</span>
                          : <span className="stock-ok">OK</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {stockRows.length === 0 && (
            <div className="empty">No stock data available.</div>
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
