"use client";

import { useState } from "react";
import type { PrinterCheckRecord } from "@/domain/printer-check";

/**
 * Noviply bedient de premiumstickerprinter op afstand, maar het apparaat staat
 * bij ons. Staat er een vraag open, dan onderbreekt dit de werkvloer — dat is de
 * bedoeling: aan de andere kant zit iemand te wachten met een order.
 */
export function PrinterCheckPrompt({
  check,
  onAnswer,
}: {
  check: PrinterCheckRecord;
  onAnswer: (status: "ready" | "blocked", note: string) => Promise<void>;
}) {
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answer(status: "ready" | "blocked") {
    setBusy(true);
    setError("");
    try {
      await onAnswer(status, note);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Doorgeven is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Vraag van Noviply">
      <div className="printer-check">
        <span className="printer-check-kicker">VRAAG VAN NOVIPLY</span>
        <h2>Staat de printer klaar?</h2>
        <p>
          Noviply wil een premiumsticker printen. Ze bedienen de printer van afstand
          en kunnen niet zien of hij aanstaat en of er materiaal in zit.
          {check.question && <> Ze vragen erbij: “{check.question}”</>}
        </p>

        {blockedOpen ? (
          <div className="printer-check-blocked">
            <label>
              <span>Wat is er aan de hand?</span>
              <input
                value={note}
                autoFocus
                maxLength={200}
                placeholder="bijvoorbeeld: materiaal is op"
                onChange={(event) => { setNote(event.target.value); setError(""); }}
                onKeyDown={(event) => { if (event.key === "Enter") void answer("blocked"); }}
              />
            </label>
            <div className="printer-check-actions">
              <button className="secondary-button" onClick={() => setBlockedOpen(false)}>
                Terug
              </button>
              <button
                className="danger-ghost-button"
                disabled={busy || note.trim().length < 3}
                onClick={() => void answer("blocked")}
              >
                Doorgeven
              </button>
            </div>
          </div>
        ) : (
          <div className="printer-check-actions">
            <button
              className="printer-check-yes"
              disabled={busy}
              onClick={() => void answer("ready")}
            >
              <b>✓</b> Ja, staat klaar
            </button>
            <button
              className="printer-check-no"
              disabled={busy}
              onClick={() => setBlockedOpen(true)}
            >
              <b>✕</b> Nee, nog niet
            </button>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  );
}
