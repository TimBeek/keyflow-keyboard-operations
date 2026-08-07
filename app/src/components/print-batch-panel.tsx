"use client";

import { useRef, useState } from "react";
import {
  activeBatches,
  batchIsDone,
  batchLabel,
  batchSheetCount,
  completedBatches,
  openBatchRows,
  unknownLanguageRows,
  type PrintBatch,
} from "@/domain/print-batch";

/**
 * De printronde zoals hij uit het ordersysteem komt.
 *
 * Die lijst werd gemaild, dus stond hij ergens anders dan de losse aanvragen en
 * moest iemand twee lijsten naast elkaar leggen. Hier staat hij naast de
 * aanvragen, kan Noviply hem afvinken, en blijft hij in de geschiedenis staan.
 *
 * Beiden mogen uploaden — dezelfde ronde twee keer is dan geen fout maar
 * dezelfde ronde, en dat zegt de melding ook.
 */

type Props = {
  batches: PrintBatch[];
  onUpload: (file: File) => Promise<{ rows: number; duplicate: boolean; sameFile: boolean }>;
  onSettleRow: (rowId: string, status: "printed" | "not_printable", note: string) => Promise<void>;
  onReopenRow: (rowId: string) => Promise<void>;
  onSettleBatch: (batchId: string) => Promise<void>;
  onSeen: (batchId: string) => void;
  onRemove: (batchId: string) => Promise<void>;
  onDownload: (batch: PrintBatch) => void;
};

function formatMoment(value: string) {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  return moment.toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function PrintBatchPanel({
  batches,
  onUpload,
  onSettleRow,
  onReopenRow,
  onSettleBatch,
  onSeen,
  onRemove,
  onDownload,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [blockedRow, setBlockedRow] = useState("");
  const [blockedNote, setBlockedNote] = useState("");
  // Welke ronde openstaat. De nieuwste die nog loopt, tenzij iemand kiest.
  const [openId, setOpenId] = useState<string | null>(null);
  // Uit de lijst halen vraagt een bevestiging: het is zelden wat je bedoelt, en
  // de knop staat naast knoppen die je wel vaak gebruikt.
  const [confirmRemove, setConfirmRemove] = useState("");

  /**
   * De rondes komen nieuwste-eerst uit de database, want dat is wat je wilt in
   * een geschiedenis. Om te wérken klopt dat niet: de ochtendronde hoort vóór
   * de middagronde, anders begin je standaard aan de jongste lijst terwijl de
   * oudste nog openstaat. Hier dus oudste-eerst, en die staat ook meteen open.
   */
  const running = [...activeBatches(batches)].sort((links, rechts) =>
    links.runDate === rechts.runDate
      ? links.batchNumber - rechts.batchNumber
      : links.runDate.localeCompare(rechts.runDate));
  const done = completedBatches(batches);
  /**
   * Openstaand of afgerond — daar kijk je nooit tegelijk naar. Staat er niets
   * meer open, dan begint hij bij de afgeronde; anders zou het scherm leeg zijn
   * terwijl er wel iets te zien is.
   */
  const [groep, setGroep] = useState<"open" | "done">("open");
  const effectieveGroep = groep === "open" && running.length === 0 && done.length > 0
    ? "done"
    : groep;
  const inGroep = effectieveGroep === "open" ? running : done;
  const shown = inGroep.find((batch) => batch.id === openId)
    ?? inGroep[0]
    ?? null;

  async function pick(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await onUpload(file);
      setMessage(result.duplicate
        ? (result.sameFile
          ? "This run was already loaded — nothing was duplicated."
          : "A run with this number already exists for that day. It was not overwritten.")
        : `${result.rows} ${result.rows === 1 ? "line" : "lines"} loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Loading the file failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function reopen(rowId: string) {
    try {
      await onReopenRow(rowId);
      setMessage("The line is open again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Undo failed.");
    }
  }

  async function settle(rowId: string, status: "printed" | "not_printable", note = "") {
    try {
      await onSettleRow(rowId, status, note);
      setBlockedRow("");
      setBlockedNote("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saving failed.");
    }
  }

  return (
    <section className="noviply-panel">
      {/* Bovenaan staat waar je naar kijkt, in de hoek staat de uitzondering.
          Er stond hier eerst nog een kop "Print runs" met een uitleg eronder —
          precies wat de pagina er twee centimeter hoger al zegt — en die duwde
          de twee tabbladen naar beneden. Weg dus: de tabbladen zijn nu het
          eerste wat je ziet, en "Add a run" zit rechtsboven waar je hem alleen
          zoekt als het ordersysteem het laat afweten. */}
      <div className="noviply-panel-head batch-kop">
        {/* Twee groepen, twee tabbladen: eerst zeggen waar je naar kijkt, dan
            pas welke ronde. Zonder rondes valt er niets te kiezen en staat de
            knop alleen in de hoek. */}
        {batches.length > 0 && (
          <div className="batch-groepen" role="tablist" aria-label="Which runs to show">
            {/* "To do" en "Completed" zeggen niet wat je ermee moet. "To print"
                en "Already printed" wel, en dat is precies het verschil dat niet
                misverstaan mag worden: aan de ene kant ligt werk, aan de andere
                kant mag niets meer door de printer. Amber is in dit scherm altijd
                "er wacht iets op jou" en groen "klaar" — dezelfde taal als de
                rest, dus die hoeft niemand apart te leren. */}
            <button
              type="button"
              role="tab"
              aria-selected={effectieveGroep === "open"}
              className={`batch-groep-open${running.length === 0 ? " leeg" : ""}${effectieveGroep === "open" ? " active" : ""}`}
              onClick={() => { setGroep("open"); setOpenId(null); }}
            >
              To print
              <span>{running.length}</span>
              {running.some((batch) => batch.seenAt === null) && (
                <em className="batch-groep-nieuw" aria-label="Includes a new run">•</em>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effectieveGroep === "done"}
              className={`batch-groep-af${effectieveGroep === "done" ? " active" : ""}`}
              onClick={() => { setGroep("done"); setOpenId(null); }}
              disabled={done.length === 0}
            >
              <b aria-hidden="true">✓</b>
              Already printed
              <span>{done.length}</span>
            </button>
          </div>
        )}
        <div className="batch-upload">
          <input
            ref={fileRef}
            type="file"
            id="batch-file"
            accept=".xlsx,.xlsm,.csv"
            className="sr-only"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <label htmlFor="batch-file" className={`secondary-button${busy ? " busy" : ""}`}>
            {busy ? "Reading…" : "Add a run"}
          </label>
        </div>
      </div>

      {message && <div className="policy-saved" role="status">{message}</div>}

      {batches.length === 0 ? (
        <div className="empty">
          No runs yet today. The morning run arrives on its own; this page keeps
          itself up to date, so there is no need to reload.
        </div>
      ) : (
        <>
          <div className="batch-tabs" role="tablist">
            {/* Geen afkapping meer op zes. Michael werkt de rondes van boven
                naar beneden af; staat er een zevende open, dan viel de oudste
                stil uit de tabbladen en bleef die voor altijd onafgemaakt. De
                strook schuift liever dan dat er werk verdwijnt. */}
            {inGroep.map((batch) => (
              <button
                key={batch.id}
                role="tab"
                aria-selected={batch.id === shown?.id}
                className={`${effectieveGroep === "done" ? "is-af " : ""}${batch.id === shown?.id ? "active" : ""}`}
                onClick={() => {
                  setOpenId(batch.id);
                  // Openen is gezien; dan mag de melding weg.
                  if (batch.seenAt === null) onSeen(batch.id);
                }}
              >
                {effectieveGroep === "done" && <b className="batch-af" aria-hidden="true">✓</b>}
                {batchLabel(batch, "en")}
                {/* Het stipje betekent "nog niet geopend". Bij een afgeronde
                    ronde zegt dat niets meer — er valt niets meer te doen — en
                    het trekt de aandacht naar de verkeerde kant. */}
                {effectieveGroep === "open" && batch.seenAt === null && (
                  <span className="batch-new" aria-label="New">•</span>
                )}
              </button>
            ))}
            {inGroep.length === 0 && (
              <span className="batch-none">
                {effectieveGroep === "open"
                  ? "All done — nothing waiting. The next run appears here by itself."
                  : "Nothing completed yet."}
              </span>
            )}
          </div>

          {shown && effectieveGroep === "done" && (
            /* De grootste fout die hier gemaakt kan worden is een afgeronde
               ronde nog een keer printen. Dat kost vellen en tijd, en je merkt
               het pas als de laptops dubbel op tafel liggen. Dus staat het er,
               boven de lijst, in plaats van dat je het uit een vinkje moet
               afleiden. */
            <div className="batch-afgerond" role="status">
              <b aria-hidden="true">✓</b>
              <span>
                <strong>Finished — do not print this run again.</strong>
                <small>
                  {(() => {
                    const geprint = shown.rows.filter((row) => row.status === "printed").length;
                    const niet = shown.rows.filter((row) => row.status === "not_printable").length;
                    return niet === 0
                      ? `All ${geprint} ${geprint === 1 ? "line was" : "lines were"} printed.`
                      : `${geprint} printed, ${niet} reported as not printable.`;
                  })()}
                </small>
              </span>
            </div>
          )}

          {shown && (
            <>
              <div className="batch-summary">
                <span>
                  {/* Eén vel is geen "1 sheets". Het valt op omdat het er
                      altijd staat, boven elke ronde. */}
                  <b>{batchSheetCount(shown)}</b> {batchSheetCount(shown) === 1 ? "sheet" : "sheets"} ·{" "}
                  {shown.rows.length} {shown.rows.length === 1 ? "line" : "lines"} ·{" "}
                  {batchIsDone(shown)
                    ? "all done"
                    : `${openBatchRows(shown)} still open`}
                </span>
                <small>
                  Loaded {formatMoment(shown.uploadedAt)} by {shown.uploadedBy} · {shown.fileName}
                </small>
                <div className="batch-summary-actions">
                  <button type="button" className="secondary-button" onClick={() => onDownload(shown)}>
                    Download for Excel
                  </button>
                  {openBatchRows(shown) > 0 && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void onSettleBatch(shown.id)}
                    >
                      All {openBatchRows(shown)} printed
                    </button>
                  )}
                  {/* Ook een ronde met openstaande regels mag weg. Dat gebeurt
                      echt: een proefronde, of een lijst die het ordersysteem
                      dubbel of verkeerd heeft gestuurd. Zonder deze knop blijft
                      die voor altijd bovenaan het werk staan. Wat je weggooit
                      staat in de bevestiging, en de regels blijven in de
                      geschiedenis. */}
                  {(
                    confirmRemove === shown.id ? (
                      <span className="batch-confirm">
                        <b>
                          {openBatchRows(shown) > 0
                            ? `Remove this run — ${openBatchRows(shown)} ${openBatchRows(shown) === 1 ? "line" : "lines"} not printed?`
                            : "Remove this run from the list?"}
                        </b>
                        <small>
                          {/* De geschiedenis toont alleen wat is afgevinkt. Een
                              regel die nooit is afgevinkt komt daar dus niet in
                              terug, en dat hoort deze zin ook te zeggen. */}
                          {openBatchRows(shown) > 0
                            ? "Nobody will print them and they will not appear in the history. Anything already ticked off stays."
                            : "The lines stay in the history."}
                        </small>
                        <button
                          type="button"
                          className="danger-ghost-button"
                          onClick={() => {
                            setConfirmRemove("");
                            setOpenId(null);
                            void onRemove(shown.id);
                          }}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setConfirmRemove("")}
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setConfirmRemove(shown.id)}
                      >
                        Remove from list
                      </button>
                    )
                  )}
                </div>
              </div>

              {unknownLanguageRows(shown).length > 0 && (
                /* Een onbekende landcode is geen reden om de regel te weigeren —
                   Noviply print hem toch — maar wel om ernaar te laten kijken. */
                <div className="batch-warning">
                  {unknownLanguageRows(shown).length}{" "}
                  {unknownLanguageRows(shown).length === 1 ? "line has" : "lines have"} a language
                  code ReKey does not know:{" "}
                  {[...new Set(unknownLanguageRows(shown).map((row) => row.languageCode))].join(", ")}
                </div>
              )}

              <div className="table-wrap">
                <table className="operations-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Model</th>
                      <th>Language</th>
                      <th>Enter</th>
                      <th>Sheets</th>
                      <th>Order number</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.rows.map((row) => (
                      <tr key={row.id} className={row.status === "open" ? "" : "settled"}>
                        <td data-label="#">{row.lineNumber}</td>
                        <td><strong>{row.model}</strong></td>
                        <td data-label="Language">
                          {row.layout || <span className="batch-unknown">{row.languageCode}?</span>}
                        </td>
                        <td data-label="Enter">{row.variant || "—"}</td>
                        <td data-label="Sheets">
                          <b className={row.quantity > 1 ? "quantity-many" : ""}>{row.quantity}×</b>
                        </td>
                        <td data-label="Order number"><b className="order-cell">{row.orderReference || "—"}</b></td>
                        <td>
                          {row.status === "open" ? (
                            blockedRow === row.id ? (
                              <div className="batch-blocked">
                                <input
                                  value={blockedNote}
                                  placeholder="Why not?"
                                  onChange={(event) => setBlockedNote(event.target.value)}
                                />
                                <button
                                  type="button"
                                  className="danger-ghost-button"
                                  onClick={() => void settle(row.id, "not_printable", blockedNote)}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => { setBlockedRow(""); setBlockedNote(""); }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="batch-row-actions">
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={() => void settle(row.id, "printed")}
                                >
                                  Printed
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => setBlockedRow(row.id)}
                                >
                                  Cannot print
                                </button>
                              </div>
                            )
                          ) : (
                            /* Er wordt met een handschoen aan op een klein
                               scherm geklikt, en "All … printed" zit vlak bij de
                               knop van één regel. Een verkeerde klik was tot nu
                               toe definitief — dan wacht er een laptop op een vel
                               dat nooit komt, of krijgt de werkvloer een melding
                               die nergens over gaat. Terugdraaien mag, en het
                               staat er bescheiden bij: het is een uitzondering,
                               geen tweede hoofdknop. */
                            <span className="print-status-cel">
                              <span className={`print-status ${row.status}`}>
                                {row.status === "printed" ? "✓ Printed" : "✕ Cannot print"}
                                {row.note && ` · ${row.note}`}
                              </span>
                              <button
                                type="button"
                                className="row-undo"
                                onClick={() => void reopen(row.id)}
                                title="Put this line back to open"
                              >
                                Undo
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
