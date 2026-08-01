"use client";

import { useEffect, useRef, useState } from "react";
import {
  batchLabel,
  batchSheetCount,
  openBatchRows,
  unseenBatches,
  type PrintBatch,
} from "@/domain/print-batch";

/**
 * Er is een nieuwe printronde binnen — als venster in beeld.
 *
 * Eerst was dit bewust géén pop-up: een balk bovenaan die je niet onderbreekt.
 * Dat werkte alleen zolang iemand naar het scherm keek. Het ordersysteem levert
 * nu twee keer per dag zelf aan, en dan staat er ineens werk klaar terwijl
 * Michael op een ander tabblad zit of net koffie haalt. Een regel die je kunt
 * missen is dan te weinig.
 *
 * Wat hem draaglijk houdt: hij komt per ronde één keer, hij gaat weg met Escape,
 * met de knop, of door ernaast te klikken, en hij houdt niets tegen — sluiten
 * kan altijd. Zodra je hem opent geldt de ronde als gezien en komt hij niet
 * terug.
 */
export function NewRunDialog({
  batches,
  onOpenRuns,
  onSeen,
}: {
  batches: PrintBatch[];
  /** Naar het rondenscherm springen; de ronde geldt dan als gezien. */
  onOpenRuns: (batchId: string) => void;
  onSeen: (batchId: string) => void;
}) {
  const nieuw = unseenBatches(batches);
  const eerste = nieuw[0] ?? null;
  // Welke rondes al een venster hebben gehad. Sluiten zonder openen betekent
  // "gezien maar nog niet gedaan": het rondje blijft in de tabbalk staan, maar
  // hetzelfde venster hoort niet elke twintig seconden terug te komen.
  const [afgehandeld, setAfgehandeld] = useState<string[]>([]);
  const knop = useRef<HTMLButtonElement>(null);

  const toon = eerste && !afgehandeld.includes(eerste.id) ? eerste : null;

  useEffect(() => {
    if (!toon) return;
    const opToets = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAfgehandeld((lijst) => [...lijst, toon.id]);
    };
    window.addEventListener("keydown", opToets);
    knop.current?.focus();
    return () => window.removeEventListener("keydown", opToets);
  }, [toon]);

  if (!toon) return null;

  const sluiten = () => setAfgehandeld((lijst) => [...lijst, toon.id]);
  const meer = nieuw.length - 1;

  return (
    <div
      className="run-alert"
      role="dialog"
      aria-modal="true"
      aria-label="A new print run has arrived"
      onClick={(event) => {
        if (event.target === event.currentTarget) sluiten();
      }}
    >
      <div className="run-alert-panel">
        <span className="run-alert-chip">NEW PRINT RUN</span>
        <h3>{batchLabel(toon, "en")}</h3>
        <p className="run-alert-cijfers">
          <b>{openBatchRows(toon)}</b> lines to print ·{" "}
          <b>{batchSheetCount(toon)}</b> sheets
        </p>
        <p className="run-alert-bron">
          Sent by {toon.uploadedBy} · {new Date(toon.uploadedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit",
          })}
        </p>
        {meer > 0 && (
          <p className="run-alert-meer">
            {meer} more new {meer === 1 ? "run is" : "runs are"} waiting as well.
          </p>
        )}
        <div className="run-alert-acties">
          <button
            ref={knop}
            type="button"
            className="primary-button"
            onClick={() => {
              setAfgehandeld((lijst) => [...lijst, toon.id]);
              onSeen(toon.id);
              onOpenRuns(toon.id);
            }}
          >
            Open the run
          </button>
          <button type="button" className="secondary-button" onClick={sluiten}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
