"use client";

import { useState } from "react";
import {
  latestAnswered,
  openCheck,
  readyToPrint,
  type PrinterCheckRecord,
} from "@/domain/printer-check";

/**
 * De printer bij ReMarkt, bediend vanuit Roemenië — als knop in de kop.
 *
 * Hij stond alleen op het aanvragenscherm. Maar de vraag "staat de printer aan"
 * hoort bij het moment dat je gaat printen, en dat kan net zo goed een ronde uit
 * het ordersysteem zijn. Dan moest je eerst van tabblad wisselen, en dat is
 * precies het soort omweg waardoor iemand het maar niet vraagt en op goed geluk
 * begint.
 *
 * Hier staat hij naast het logo, op elk scherm, en hij laat in één regel zien
 * hoe het ervoor staat: nog niets gevraagd, gevraagd en wachten, klaar, of niet
 * klaar met de reden erbij. De uitgebreide versie met wie er geantwoord heeft
 * blijft op het aanvragenscherm staan.
 */
export function RemotePrinterButton({
  printerChecks,
  onAsk,
  onStartPrinting,
}: {
  printerChecks: PrinterCheckRecord[];
  onAsk: () => void;
  onStartPrinting: (id: string) => void;
}) {
  const [sending, setSending] = useState(false);
  const waiting = openCheck(printerChecks);
  const ready = readyToPrint(printerChecks);
  const answered = latestAnswered(printerChecks);
  const blocked = !ready && !waiting && answered?.status === "blocked" ? answered : null;

  function ask() {
    setSending(true);
    onAsk();
    window.setTimeout(() => setSending(false), 1400);
  }

  if (ready) {
    return (
      <div className="printer-chip is-ready">
        <span className="printer-chip-text">
          <b>Printer is ready</b>
          <small>Confirmed by {ready.answeredBy}</small>
        </span>
        <button type="button" className="printer-chip-go" onClick={() => onStartPrinting(ready.id)}>
          We are printing now
        </button>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="printer-chip is-waiting">
        <span className="printer-chip-text">
          <b>Waiting for the floor…</b>
          <small>They have been asked</small>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`printer-chip is-action${blocked ? " is-blocked" : ""}${sending ? " is-sending" : ""}`}
      disabled={sending}
      onClick={ask}
      title="Ask the floor whether the remote printer is loaded and switched on"
    >
      <span className="printer-chip-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <path d="M16.5 8a6 6 0 0 1 0 8" strokeLinecap="round" />
          <path d="M7.5 16a6 6 0 0 1 0-8" strokeLinecap="round" />
        </svg>
      </span>
      <span className="printer-chip-text">
        <b>
          {sending
            ? "Sending…"
            : blocked
              ? "Printer not ready — ask again"
              : "Is the remote printer ready?"}
        </b>
        <small>
          {sending
            ? "The floor is getting the message"
            : blocked
              ? blocked.answerNote || "The floor said it is not ready"
              : "Ask the floor before you start"}
        </small>
      </span>
    </button>
  );
}
