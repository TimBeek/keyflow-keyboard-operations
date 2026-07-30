"use client";

import { useEffect } from "react";

/**
 * Een scherm dat omvalt meldt zichzelf.
 *
 * Tot nu toe hoorde je het pas als iemand belde dat "het niet meer werkt", en
 * dan was er niets meer terug te vinden: geen melding, geen moment, geen scherm.
 * Nu komt het bij management in beeld met de plek en de tijd erbij.
 *
 * Twee dingen die het bewust niet doet: het onderbreekt niets — de gebruiker
 * merkt er niets van — en het stuurt niets als dezelfde fout al is gemeld,
 * zodat een lus in een scherm niet honderd keer hetzelfde verstuurt.
 */
export function ErrorReporter({ role }: { role: string }) {
  useEffect(() => {
    const gemeld = new Set<string>();

    const meld = (message: string, detail: string) => {
      const kort = message.slice(0, 300);
      if (!kort || gemeld.has(kort)) return;
      gemeld.add(kort);
      // Geen await en geen foutafhandeling die zichtbaar wordt: als de melding
      // zelf niet aankomt, is dat geen reden om de gebruiker lastig te vallen.
      void fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: `${window.location.pathname} · ${role}`,
          message: kort,
          detail: detail.slice(0, 1200),
          role,
        }),
      }).catch(() => undefined);
    };

    const opFout = (event: ErrorEvent) => {
      meld(event.message, event.error instanceof Error ? (event.error.stack ?? "") : "");
    };
    const opAfwijzing = (event: PromiseRejectionEvent) => {
      const reden = event.reason;
      meld(
        reden instanceof Error ? reden.message : String(reden),
        reden instanceof Error ? (reden.stack ?? "") : "",
      );
    };

    window.addEventListener("error", opFout);
    window.addEventListener("unhandledrejection", opAfwijzing);
    return () => {
      window.removeEventListener("error", opFout);
      window.removeEventListener("unhandledrejection", opAfwijzing);
    };
  }, [role]);

  return null;
}
