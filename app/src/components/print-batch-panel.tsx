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
  onSettleBatch: (batchId: string) => Promise<void>;
  onSeen: (batchId: string) => void;
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
  onSettleBatch,
  onSeen,
  onDownload,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [blockedRow, setBlockedRow] = useState("");
  const [blockedNote, setBlockedNote] = useState("");
  // Welke ronde openstaat. De nieuwste die nog loopt, tenzij iemand kiest.
  const [openId, setOpenId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  /**
   * Een voltooide ronde hoort niet meer tussen het werk te staan. Weggooien
   * doen we niet: de regels zitten in de geschiedenis en de ronde is de herkomst
   * daarvan. Dus opzij, achter een mapje dat je open kunt klappen.
   */
  const running = activeBatches(batches);
  const done = completedBatches(batches);
  const shown = batches.find((batch) => batch.id === openId)
    ?? running[0]
    ?? done[0]
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
        : `${result.rows} lines loaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Loading the file failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
      <div className="noviply-panel-head">
        <div>
          <h3>Print runs</h3>
          <p>
            The list from the order system, twice a day. Drop the file here and it
            sits next to the extra requests — no more mail.
          </p>
        </div>
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
          No runs loaded yet. The file is called batch-1-… or batch-2-… and may be
          .xlsx or .csv.
        </div>
      ) : (
        <>
          <div className="batch-tabs" role="tablist">
            {running.slice(0, 6).map((batch) => (
              <button
                key={batch.id}
                role="tab"
                aria-selected={batch.id === shown?.id}
                className={batch.id === shown?.id ? "active" : ""}
                onClick={() => {
                  setOpenId(batch.id);
                  // Openen is gezien; dan mag de melding weg.
                  if (batch.seenAt === null) onSeen(batch.id);
                }}
              >
                {batchLabel(batch)}
                {batch.seenAt === null && <span className="batch-new" aria-label="New">•</span>}
              </button>
            ))}
            {running.length === 0 && (
              <span className="batch-none">
                All done. Use “Add a run” to load the next one.
              </span>
            )}
          </div>

          {done.length > 0 && (
            <div className="batch-archive">
              <button type="button" onClick={() => setArchiveOpen((open) => !open)}>
                {archiveOpen ? "▾" : "▸"} Completed runs ({done.length})
              </button>
              {archiveOpen && (
                <div className="batch-archive-list">
                  {done.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      className={batch.id === shown?.id ? "active" : ""}
                      onClick={() => setOpenId(batch.id)}
                    >
                      <b aria-hidden="true">✓</b> {batchLabel(batch)}
                      <small>{batchSheetCount(batch)} sheets</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {shown && (
            <>
              <div className="batch-summary">
                <span>
                  <b>{batchSheetCount(shown)}</b> sheets · {shown.rows.length} lines ·{" "}
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
                </div>
              </div>

              {unknownLanguageRows(shown).length > 0 && (
                /* Een onbekende landcode is geen reden om de regel te weigeren —
                   Noviply print hem toch — maar wel om ernaar te laten kijken. */
                <div className="batch-warning">
                  {unknownLanguageRows(shown).length} line(s) have a language code KeyFlow
                  does not know:{" "}
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
                        <td>{row.lineNumber}</td>
                        <td><strong>{row.model}</strong></td>
                        <td>
                          {row.layout || <span className="batch-unknown">{row.languageCode}?</span>}
                        </td>
                        <td>{row.variant || "—"}</td>
                        <td>
                          <b className={row.quantity > 1 ? "quantity-many" : ""}>{row.quantity}×</b>
                        </td>
                        <td><b className="order-cell">{row.orderReference || "—"}</b></td>
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
                            <span className={`print-status ${row.status}`}>
                              {row.status === "printed" ? "✓ Printed" : "✕ Cannot print"}
                              {row.note && ` · ${row.note}`}
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
