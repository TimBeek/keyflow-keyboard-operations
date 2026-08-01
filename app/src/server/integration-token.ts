import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * De sleutel waarmee het ordersysteem zich meldt.
 *
 * Elke andere route hangt aan een browsersessie: een cookie, een pincode, een
 * Microsoft-login. Een ordersysteem heeft dat allemaal niet — dat is een
 * programma op een andere server. Dus één gedeelde sleutel, meegestuurd in de
 * kop, en verder niets: geen IP-lijst (die klopt niet meer zodra er iets
 * verhuist) en geen "als hij van binnen komt is het goed" (dat is geen slot).
 *
 * Drie dingen zijn met opzet zo:
 *
 * - **Zonder sleutel gaat de deur op slot, niet open.** Staat de omgevings-
 *   variabele er niet, dan geeft de route 503. Een route die zonder sleutel
 *   iedereen binnenlaat is precies de fout die je pas merkt als het te laat is.
 * - **Vergelijken duurt altijd even lang.** Een gewone `===` stopt bij het
 *   eerste verschil, en dan kun je uit de responstijd letter voor letter de
 *   sleutel afleiden. Daarom eerst hashen (dan is de lengte altijd gelijk) en
 *   dan `timingSafeEqual`.
 * - **De sleutel opent alleen deze ene route.** Hij geeft geen sessie en geen
 *   cookie; wie hem heeft kan een printronde aanleveren en verder niets.
 */

/** Minimaal dit, anders is het geen sleutel maar een wachtwoordje. */
const minimaleLengte = 24;

export type TokenUitkomst =
  | { ok: true }
  | { ok: false; status: 401 | 503; code: string; message: string };

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Haalt de sleutel uit de kop: "Authorization: Bearer …" of "X-ReKey-Token". */
export function tokenFromRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+(.+)$/i.exec(auth.trim());
  if (bearer) return bearer[1].trim();
  return (request.headers.get("x-rekey-token") ?? "").trim();
}

export function checkIntegrationToken(
  request: Request,
  environment: Record<string, string | undefined> = process.env,
): TokenUitkomst {
  const verwacht = (environment.REKEY_RESYNC_TOKEN ?? "").trim();
  if (verwacht.length === 0) {
    return {
      ok: false,
      status: 503,
      code: "INTEGRATION_DISABLED",
      message:
        "Deze koppeling staat uit. Zet REKEY_RESYNC_TOKEN op de server voordat je hem gebruikt.",
    };
  }
  if (verwacht.length < minimaleLengte) {
    return {
      ok: false,
      status: 503,
      code: "INTEGRATION_TOKEN_WEAK",
      message: `De ingestelde sleutel is te kort; gebruik er een van minstens ${minimaleLengte} tekens.`,
    };
  }

  const gekregen = tokenFromRequest(request);
  if (gekregen.length === 0 || !timingSafeEqual(hash(gekregen), hash(verwacht))) {
    return {
      ok: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Stuur een geldige sleutel mee in de Authorization-kop.",
    };
  }
  return { ok: true };
}
