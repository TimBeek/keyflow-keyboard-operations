"use client";

import { useMemo, useState } from "react";
import { inventoryQuantity } from "@/domain/inventory-quantities";
import {
  layoutWithCountry,
  type InventoryTransactionEntry,
} from "@/domain/operations";
import { dayKey } from "@/domain/reporting";
import { inventoryCatalog } from "@/data/inventory-catalog";
import { downloadTekstbestand } from "@/lib/bestand-downloaden";
import { printVerdicts } from "@/domain/print-verdict";
import { StockPlanner } from "@/components/stock-planner";
import { NoviplyLogo } from "@/components/noviply-logo";
import { RemotePrinterButton } from "@/components/remote-printer-button";
import { NewRunDialog } from "@/components/new-run-dialog";
import { trackpointLabel } from "@/domain/noviply-export";
import {
  unavailableReasonEnglish,
  unavailableReasons,
  type NoviplyUnavailableRecord,
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
  createVerdictCsv,
  noviplyExportFilename,
} from "@/domain/noviply-export";
import { displayStickerSku } from "@/domain/sticker-sku";
import {
  stickerVerificationFailureEnglish,
  type StickerVerificationReport,
} from "@/domain/sticker-verification";
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

export type NoviplyTab = "orders" | "stock" | "runs" | "blocked" | "history";

type Props = {
  tab: NoviplyTab;
  /** De rondes uit het ordersysteem; leeg tot er één is ingelezen. */
  printBatches: PrintBatch[];
  onUploadBatch: (file: File) => Promise<{ rows: number; duplicate: boolean; sameFile: boolean }>;
  onSettleBatchRow: (
    rowId: string,
    status: "printed" | "not_printable",
    note: string,
    reason: UnavailableReason,
  ) => Promise<void>;
  /** Een verkeerde klik terugdraaien; de regel staat dan weer open. */
  onReopenBatchRow: (rowId: string) => Promise<void>;
  /** Wat Noviply naar eigen zeggen niet kan printen. */
  noviplyUnavailable: NoviplyUnavailableRecord[];
  /** Zij melden zelf dat het weer kan; dan vervalt de blokkade. */
  onAllowAgain: (id: string) => void;
  /** Meldingen van de werkvloer dat een vel niet paste. Zij lezen mee, meer niet. */
  verificationReports: StickerVerificationReport[];
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
  onReopenBatchRow,
  noviplyUnavailable,
  onAllowAgain,
  verificationReports,
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
  /**
   * Vellen die bij ons niet pasten.
   *
   * Alleen "past niet": dat gaat over de print zelf. De andere afwijkingen —
   * verkeerde hangmap, verkeerd artikelnummer — zijn grijpfouten hier op de
   * vloer en zeggen niets over hun werk; die bij hen neerleggen is onterecht.
   * De laatste dertig, want ouder dan dat helpt niemand meer.
   */
  const pastenNiet = useMemo(
    () => verificationReports
      .filter((report) => report.failureReason === "position_mismatch")
      .sort((links, rechts) => rechts.occurredAt.localeCompare(links.occurredAt))
      .slice(0, 30),
    [verificationReports],
  );

  /**
   * Alles wat zij niet konden printen, uit alle bronnen, één regel per model
   * en taal.
   *
   * Hun eigen lijst toonde alleen de blokkadetabel, en die werd uitsluitend
   * gevuld door losse aanvragen. Het grootste deel van hun werk — de ochtend-
   * en middagronde — stond er dus niet in. Vandaar dat de lijst onvolledig
   * aanvoelde.
   */
  const oordelen = useMemo(
    () => printVerdicts(printBatches, printRequests, noviplyUnavailable),
    [printBatches, printRequests, noviplyUnavailable],
  );

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

  /*
   * Het kengetal in de kop komt uit dezelfde lijst als de tabellen eronder.
   * Er stond hier een tweede, eigen berekening; die kon precies zo uit de pas
   * gaan lopen als de twee panelen dat deden.
   */
  const measuring = historyDays < minimumHistoryDays;

  function exportPrintRequests() {
    const moment = new Date().toISOString();
    // Alles, niet alleen wat openstaat: hun eigen administratie wil de
    // afgehandelde regels er ook bij.
    downloadTekstbestand(
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
          printRequests={printRequests}
          unavailable={noviplyUnavailable}
          onUpload={onUploadBatch}
          onSettleRow={onSettleBatchRow}
          onReopenRow={onReopenBatchRow}
          onSettleBatch={onSettleBatch}
          onSeen={onBatchSeen}
          onRemove={onRemoveBatch}
          onDownload={(batch) => {
            downloadTekstbestand(
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

      {/* Wat er het hardst doorheen gaat. ReMarkt heeft hier een eigen analyse
          voor, maar die is op geld en op A/B/C — dat is een inkoopgesprek.
          Noviply wil iets anders weten: wat moet ik voorradig houden, en waar
          loop ik straks tegenaan. Dus verbruik en hoeveel weken dat nog meegaat. */}
      {/* Wat zij zelf hebben gemeld als "kunnen wij niet". Dat stond alleen op
          het scherm van ReMarkt, en dan moet iemand daar horen dat de folie
          binnen is en het overtikken. Hier zien ze hun eigen meldingen staan en
          kunnen ze zelf zeggen dat het weer kan. */}
      {tab === "blocked" && (
      <section className="noviply-panel">
        <div className="noviply-panel-head">
          <div>
            <h3>What we cannot print</h3>
            <p>
              Everything you reported as not printable — from the daily runs as well as
              from single requests, one line per model and language. The floor is not
              offered the blocked ones at all, so nothing comes your way for them until
              you say it works again.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              downloadTekstbestand(
                createVerdictCsv(oordelen),
                noviplyExportFilename("cannot-print", new Date().toISOString()),
              );
              setMessage(`Downloaded ${oordelen.length} lines.`);
            }}
          >
            Download for Excel
          </button>
        </div>
        {oordelen.length === 0 ? (
          <div className="empty">
            Nothing blocked. Everything you have been asked for so far, you could print.
          </div>
        ) : (
          <ul className="blocked-list">
            {oordelen.map((oordeel) => (
              <li key={oordeel.key} className={oordeel.blockId ? "" : "is-history"}>
                <div>
                  <strong>{oordeel.model}</strong>
                  <span>
                    {oordeel.layout ? oordeel.layout : "All languages"}
                    {" · "}
                    {oordeel.reason
                      ? unavailableReasonEnglish(oordeel.reason)
                      : oordeel.note || "No reason given"}
                  </span>
                  {oordeel.reason && oordeel.note && (
                    <small className="blocked-note">“{oordeel.note}”</small>
                  )}
                  <small>
                    {oordeel.blockId ? "Blocked" : "Could not print it that time"}
                    {oordeel.when && ` · ${new Date(oordeel.when).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short",
                    })}`}
                    {oordeel.sourceLabel && ` · ${oordeel.sourceLabel}`}
                    {oordeel.orders.length > 0
                      && ` · ${oordeel.orders.length} ${oordeel.orders.length === 1 ? "order" : "orders"}`}
                  </small>
                </div>
                {oordeel.blockId ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      onAllowAgain(oordeel.blockId as string);
                      setMessage(`${oordeel.model} is available again.`);
                    }}
                  >
                    We can print this again
                  </button>
                ) : (
                  /* Er staat niets stil: dit was eenmalig en de werkvloer krijgt
                     het gewoon weer aangeboden. Dan valt er ook niets in te
                     trekken — een knop die niets doet is erger dan geen knop. */
                  <span className="blocked-open">Still offered</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {tab === "blocked" && (
      <section className="noviply-panel">
        <h3>Sheets that did not fit</h3>
        <p>
          The floor reported these after applying: the shape or the position was
          off. Nothing to do here — it is the other half of the same picture, so
          you can see where a file needs another look.
        </p>
        {pastenNiet.length === 0 ? (
          <p className="lege-lijst">Nothing reported. Every sheet fitted.</p>
        ) : (
          <ul className="misfit-list">
            {pastenNiet.map((report) => (
              <li key={report.id}>
                <strong>{report.model}</strong>
                <span>
                  {report.targetLayout}
                  {" · "}
                  {stickerVerificationFailureEnglish(report.failureReason)}
                </span>
                <small>
                  {new Date(report.occurredAt).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short",
                  })}
                  {report.orderReference ? ` · order ${report.orderReference}` : ""}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {tab === "stock" && (
        <StockPlanner
          taal="en"
          transactions={transactions}
          quantities={quantities}
          policy={{
            leadTimeDays: resupplyLeadTimeDays,
            reviewDays: 7,
            safetyDays: resupplySafetyWeeks * 7,
          }}
        />
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
