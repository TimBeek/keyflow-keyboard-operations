/**
 * Wat de werkvloer moet weten over de stickers die zij bij Noviply hebben
 * aangevraagd.
 *
 * Een medewerker die een sticker aanvraagt zet de laptop apart en gaat door.
 * Zonder terugkoppeling blijft die laptop staan tot iemand er toevallig langs
 * loopt. Dit maakt zichtbaar wat er klaarligt, wat nog wacht, en wat niet kan.
 */

import type { PrintRequestRecord } from "./print-requests";

export type PrintRequestGroups = {
  /** Geprint: deze laptops kunnen verder. */
  ready: PrintRequestRecord[];
  /** Nog niets mee gebeurd. */
  waiting: PrintRequestRecord[];
  /** Kan niet geprint worden; hier moet iemand iets mee. */
  blocked: PrintRequestRecord[];
  /** Teruggetrokken door de werkvloer voordat Noviply eraan begon. */
  cancelled: PrintRequestRecord[];
};

/** Hoe lang iets "nieuw" is voor wie er niet de hele dag naar kijkt. */
export const freshHours = 8;

export function groupPrintRequests(requests: PrintRequestRecord[]): PrintRequestGroups {
  const byMoment = (left: PrintRequestRecord, right: PrintRequestRecord) =>
    (right.handledAt ?? right.requestedAt).localeCompare(left.handledAt ?? left.requestedAt);

  return {
    ready: requests.filter((request) => request.status === "printed").sort(byMoment),
    waiting: requests.filter((request) => request.status === "requested").sort(byMoment),
    blocked: requests.filter((request) => request.status === "not_printable").sort(byMoment),
    /** Teruggetrokken door de werkvloer; blijft zichtbaar in de geschiedenis. */
    cancelled: requests.filter((request) => request.status === "cancelled").sort(byMoment),
  };
}

/** Sinds kort afgehandeld: daar hoort de medewerker op geattendeerd te worden. */
export function isFresh(request: PrintRequestRecord, now: Date) {
  if (!request.handledAt) return false;
  const handled = new Date(request.handledAt).getTime();
  if (Number.isNaN(handled)) return false;
  return now.getTime() - handled < freshHours * 60 * 60 * 1000;
}

/**
 * Wat er nog bij Noviply staat. Dat is het getal dat de werkvloer wil zien:
 * "ik heb er tien uitstaan". Zodra er geprint is valt hij vanzelf weg — een
 * teller die blijft staan bij wat al gedaan is, telt het verkeerde.
 */
export function openCount(requests: PrintRequestRecord[]) {
  return requests.filter((request) => request.status === "requested").length;
}

/**
 * Hoe lang een aanvraag mag wachten voordat het redelijk is Noviply eraan te
 * herinneren. Korter zou zeuren zijn: zij printen 's ochtends en 's middags.
 */
export const reminderAfterHours = 3;

/** De oudste openstaande aanvraag, of null. */
export function oldestOpen(requests: PrintRequestRecord[]) {
  return requests
    .filter((request) => request.status === "requested")
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))[0] ?? null;
}

export function waitingTooLong(requests: PrintRequestRecord[], now: Date) {
  const oldest = oldestOpen(requests);
  if (!oldest) return false;
  const asked = new Date(oldest.requestedAt).getTime();
  if (Number.isNaN(asked)) return false;
  return now.getTime() - asked > reminderAfterHours * 60 * 60 * 1000;
}

export function printRequestHeadline(groups: PrintRequestGroups) {
  if (groups.ready.length > 0) {
    return groups.ready.length === 1
      ? "1 sticker ligt klaar om op te halen."
      : `${groups.ready.length} stickers liggen klaar om op te halen.`;
  }
  if (groups.blocked.length > 0) {
    return "Een aanvraag kan niet geprint worden. Kijk wat er moet gebeuren.";
  }
  if (groups.waiting.length > 0) {
    return groups.waiting.length === 1
      ? "1 aanvraag staat bij Noviply. Zodra hij geprint is, zie je het hier."
      : `${groups.waiting.length} aanvragen staan bij Noviply. Zodra ze geprint zijn, zie je het hier.`;
  }
  return "Er staat niets open bij Noviply.";
}
