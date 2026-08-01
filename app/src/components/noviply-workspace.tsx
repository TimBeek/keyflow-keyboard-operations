"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-catalog";
import { inventoryQuantity } from "@/domain/inventory-quantities";
import {
  layoutWithCountry,
  type InventoryTransactionEntry,
} from "@/domain/operations";
import { dayKey } from "@/domain/reporting";
import { NoviplyLogo } from "@/components/noviply-logo";
import { RemotePrinterButton } from "@/components/remote-printer-button";
import { NewRunDialog } from "@/components/new-run-dialog";
import { trackpointLabel } from "@/domain/noviply-export";
import {
  unavailableReasonEnglish,
  unavailableReasons,
  type UnavailableReason,
} from "@/domain/noviply-availability";
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
  createPrintBatchCsv,
  createNoviplyStockCsv,
  noviplyExportFilename,
} from "@/domain/noviply-export";
import { displayStickerSku } from "@/domain/sticker-sku";
import { PrintBatchPanel } from "@/components/print-batch-panel";
import {
  historyTotals,
  noviplyHistory,
  searchNoviplyHistory,
} from "@/domain/noviply-history";
import {
  activeBatches,
  batchLabel,
  batchSheetCount,
  unseenBatches,
  type PrintBatch,
} from "@/domain/print-batch";
import type { PrinterCheckRecord } from "@/domain/printer-check";

export type NoviplyTab = "orders" | "stock" | "runs" | "history";

type Props = {
  tab: NoviplyTab;
  /** De rondes uit het ordersysteem; leeg tot er één is ingelezen. */
  printBatches: PrintBatch[];
  onUploadBatch: (file: File) => Promise<{ rows: number; duplicate: boolean; sameFile: boolean }>;
  onSettleBatchRow: (rowId: string, status: "printed" | "not_printable", note: string) => Promise<void>;
  onSettleBatch: (batchId: string) => Promise<void>;
  onBatchSeen: (batchId: string) => void;
  /** Naar het rondenscherm springen vanuit de melding van een nieuwe ronde. */
  onOpenRuns: () => void;
  onRemoveBatch: (batchId: string) => Promise<void>;
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
    unavailableReason: UnavailableReason,
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
  printBatches,
  onUploadBatch,
  onSettleBatchRow,
  onSettleBatch,
  onBatchSeen,
  onOpenRuns,
  onRemoveBatch,
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
  /**
   * Waarom het niet kan. "We do not have this model" is morgen nog waar, dus
   * daar hoort de werkvloer niet opnieuw een aanvraag voor te doen. "Not right
   * now" is dat wel: dat verandert het advies niet.
   */
  const [blockedReason, setBlockedReason] = useState<UnavailableReason>("model_unknown");
  const [message, setMessage] = useState("");
  // Kort na het indrukken laat de knop zien dat het seintje weg is. Zonder dat
  // moment gebeurt er in beeld niets tot de server antwoordt.
  const [historyQuery, setHistoryQuery] = useState("");

  const totals = printRequestTotals(printRequests);
  /**
   * Wat er in de rondes zelf nog te doen is. Alleen de rondes die nog lopen:
   * een afgeronde ronde telt niet mee in "nog te doen", en de regels ervan
   * staan in de geschiedenis.
   */
  const runTotals = useMemo(() => {
    const lopend = activeBatches(printBatches);
    const regels = lopend.flatMap((batch) => batch.rows);
    return {
      open: regels.filter((row) => row.status === "open").length,
      printed: regels.filter((row) => row.status === "printed").length,
      sheets: regels
        .filter((row) => row.status === "open")
        .reduce((som, row) => som + row.quantity, 0),
    };
  }, [printBatches]);
  const open = printRequests
    .filter((request) => request.status === "requested")
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  /**
   * De geschiedenis toonde alleen de losse aanvragen. Sinds de rondes hier
   * worden ingelezen is dat het kleinste deel van het werk, en stonden de vellen
   * uit een ronde nergens terug te vinden. Nu komen beide bronnen samen.
   */
  const historyAll = useMemo(
    () => noviplyHistory(printRequests, printBatches),
    [printRequests, printBatches],
  );
  const historyShown = useMemo(
    () => searchNoviplyHistory(historyAll, historyQuery),
    [historyAll, historyQuery],
  );

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
    reason: UnavailableReason = "temporary",
  ) {
    try {
      await onSettlePrintRequest(record, status, note, reason);
      setBlockedId("");
      setBlockedNote("");
      setBlockedReason("model_unknown");
      setMessage(status === "printed"
        ? `${record.model} marked as printed.`
        : `${record.model} reported as not printable.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saving failed.");
    }
  }

  return (
    <div className="noviply-workspace">
      {/* Hun eigen merk boven hun eigen scherm. Michael werkt hier de hele dag;
          dan hoort het niet aan te voelen als een hoekje van onze app.

          De printerknop staat ernaast en niet op één tabblad: of je nu een
          ronde uit het ordersysteem afwerkt of een losse aanvraag, de vraag
          "staat de printer aan" komt op hetzelfde moment. */}
      {/* Een nieuwe ronde is werk dat klaarstaat; dat mag je niet missen omdat
          je net op een ander tabblad keek. */}
      <NewRunDialog
        batches={printBatches}
        onSeen={onBatchSeen}
        onOpenRuns={onOpenRuns}
      />
      <div className="noviply-brandbalk">
        <NoviplyLogo />
        <RemotePrinterButton
          printerChecks={printerChecks}
          onAsk={onAskPrinterCheck}
          onStartPrinting={onStartPrinting}
        />
      </div>
      {/* Vier kengetallen op elk scherm maakt van elk scherm een stapel. Ze
          horen bij het werk dat nog moet gebeuren, niet bij de kast of bij
          wat al is afgehandeld. */}
      {tab !== "history" && (
      <div className="noviply-totals">
        {tab === "runs" && (
        <>
        {/* Op dit scherm gaan de getallen over de rondes en niet over de losse
            aanvragen. Ze stonden op nul terwijl er drie regels open lagen, en
            dan tellen ze iets anders dan waar je naar kijkt. */}
        <article>
          <span>TO DO</span>
          <strong className={runTotals.open > 0 ? "attention" : ""}>{runTotals.open}</strong>
          <small>lines waiting to be printed</small>
        </article>
        <article>
          <span>SHEETS TODAY</span>
          <strong>{runTotals.sheets}</strong>
          <small>across the runs still open</small>
        </article>
        <article>
          <span>PRINTED</span>
          <strong>{runTotals.printed}</strong>
          <small>lines ticked off in these runs</small>
        </article>
        </>
        )}
        {tab === "orders" && (
        <>
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
        </>
        )}
        {/* De kast hoort bij Stock, niet naast "wacht op printen". */}
        {tab === "stock" && (
        <article>
          <span>{withKnownMinimum === 0 ? "EMPTY FOLDERS" : "RESUPPLY"}</span>
          <strong className={(withKnownMinimum === 0 ? empty : running.length) > 0 ? "attention" : ""}>
            {withKnownMinimum === 0 ? empty : running.length}
          </strong>
          <small>{withKnownMinimum === 0
            ? "nothing left in these"
            : "folders below their minimum"}</small>
        </article>
        )}
      </div>
      )}

      {/* Een nieuwe ronde hoort op te vallen zonder het werk te onderbreken:
          geen pop-up, wel een regel bovenaan tot ze hem hebben geopend. */}
      {unseenBatches(printBatches).length > 0 && tab !== "runs" && (
        <div className="batch-notice" role="status">
          <span className="batch-notice-dot" aria-hidden="true" />
          <span className="batch-notice-chip">NEW</span>
          <span>
            <strong>
              {unseenBatches(printBatches).length === 1
                ? `New print run: ${batchLabel(unseenBatches(printBatches)[0], "en")}`
                : `${unseenBatches(printBatches).length} new print runs`}
            </strong>
            <small>
              {batchSheetCount(unseenBatches(printBatches)[0])} sheets waiting to be printed
            </small>
          </span>
        </div>
      )}

      {tab === "runs" && (
        <PrintBatchPanel
          batches={printBatches}
          onUpload={onUploadBatch}
          onSettleRow={onSettleBatchRow}
          onSettleBatch={onSettleBatch}
          onSeen={onBatchSeen}
          onRemove={onRemoveBatch}
          onDownload={(batch) => {
            downloadCsv(
              createPrintBatchCsv(batch.rows),
              noviplyExportFilename("run", new Date().toISOString()),
            );
            setMessage(`Downloaded ${batchLabel(batch, "en")}.`);
          }}
        />
      )}

      {/* Het uitgebreide printerpaneel stond hier ook nog. Twee plekken voor
          dezelfde handeling betekent twee keer kijken welke de actuele stand
          toont; de knop in de kop staat op elk tabblad en zegt hetzelfde. */}
      {tab === "orders" && (
      <section className="noviply-panel">
        <div className="noviply-panel-head">
          <div>
            <h3>Print request list</h3>
            <p>
              The two daily runs for foreign orders are automatic. This list only holds
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
                <th>Trackpoint</th>
                <th>Sheets</th>
                <th>Order number</th>
                <th>Requested</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {open.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.brand}</strong><span>{request.model}</span></td>
                  <td data-label="Language">{request.layout}</td>
                  <td data-label="Enter">{request.variant || "—"}</td>
                  <td data-label="Trackpoint">
                    <b className={request.trackpoint === "unknown" ? "trackpoint-unknown" : ""}>
                      {trackpointLabel(request.trackpoint)}
                    </b>
                  </td>
                  {/* Eén order kan meerdere laptops zijn; meer dan één valt op,
                      want dat is het geval waar misgeprint wordt. */}
                  <td data-label="Sheets"><b className={request.quantity > 1 ? "quantity-many" : ""}>{request.quantity}×</b></td>
                  <td data-label="Order number"><b className="order-cell">{request.orderReference || "—"}</b></td>
                  <td data-label="Requested">
                    <strong>{formatMoment(request.requestedAt)}</strong>
                    <span>{request.reason || request.requestedBy}</span>
                  </td>
                  <td>
                    {blockedId === request.id ? (
                      <div className="noviply-blocked">
                        {/* Welke reden het is bepaalt of de werkvloer dit model
                            morgen weer aanbiedt. De eerste twee zijn blijvend. */}
                        <select
                          value={blockedReason}
                          onChange={(event) => setBlockedReason(event.target.value as UnavailableReason)}
                          aria-label="Why can this not be printed?"
                        >
                          {unavailableReasons.map((reason) => (
                            <option key={reason} value={reason}>
                              {unavailableReasonEnglish(reason)}
                            </option>
                          ))}
                        </select>
                        <input
                          value={blockedNote}
                          onChange={(event) => setBlockedNote(event.target.value)}
                          placeholder="Anything to add? (optional)"
                          maxLength={200}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="danger-ghost-button"
                          onClick={() => settle(
                            request,
                            "not_printable",
                            blockedNote.trim() || unavailableReasonEnglish(blockedReason),
                            blockedReason,
                          )}
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
            <div className="empty">Nothing extra requested. The two daily runs cover everything.</div>
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

      {tab === "history" && (
        <section className="noviply-panel">
          <div className="noviply-panel-head">
            <div>
              <h3>History</h3>
              <p>
                Everything ticked off — the extra requests and the daily runs, in
                one list with the time.
              </p>
            </div>
            {/* Een lijst waarin je moet scrollen om één ordernummer terug te
                vinden is geen administratie. */}
            <label className="history-search">
              <span className="sr-only">Search the history</span>
              <input
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Order number, model, language, batch…"
              />
              {historyQuery && (
                <button type="button" onClick={() => setHistoryQuery("")} aria-label="Clear">×</button>
              )}
            </label>
          </div>
          <p className="history-count">
            {historyTotals(historyShown).lines} of {historyTotals(historyAll).lines} lines ·{" "}
            {historyTotals(historyShown).sheets} sheets ·{" "}
            {historyTotals(historyShown).blocked} could not be printed
          </p>
          <div className="table-wrap">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>Brand / model</th>
                  <th>Language</th>
                  <th>Sheets</th>
                  <th>Order number</th>
                  <th>Where from</th>
                  <th>Outcome</th>
                  <th>Handled</th>
                </tr>
              </thead>
              <tbody>
                {historyShown.map((entry) => (
                  <tr key={entry.id}>
                    <td><strong>{entry.brand}</strong><span>{entry.model}</span></td>
                    <td data-label="Language">{entry.layout}{entry.variant && ` · ${entry.variant}`}</td>
                    <td data-label="Sheets">
                      <b className={entry.quantity > 1 ? "quantity-many" : ""}>{entry.quantity}×</b>
                    </td>
                    <td data-label="Order number"><b className="order-cell">{entry.orderReference || "—"}</b></td>
                    <td data-label="Where from">
                      {entry.source === "run"
                        ? <span className="from-run">{entry.sourceLabel}</span>
                        : <span className="from-request">Extra request</span>}
                    </td>
                    <td data-label="Outcome">
                      <span className={`print-status ${entry.outcome}`}>
                        {entry.outcome === "printed" ? "✓ Printed" : "✕ Cannot print"}
                      </span>
                      {entry.note && <span>{entry.note}</span>}
                    </td>
                    <td data-label="Handled">{entry.handledAt ? formatMoment(entry.handledAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historyShown.length === 0 && (
              <div className="empty">
                {historyQuery
                  ? `Nothing matches “${historyQuery}”.`
                  : "Nothing ticked off yet in this pilot."}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
