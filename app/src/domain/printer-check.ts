/**
 * Noviply bedient de premiumstickerprinter op afstand, maar het apparaat staat
 * bij ons. Of er papier in zit en of er iemand bij staat, kunnen zij niet zien.
 * Deze vraag overbrugt dat: Noviply vraagt het, de werkvloer antwoordt.
 */

export type PrinterCheckStatus = "pending" | "ready" | "blocked";

export type PrinterCheckRecord = {
  id: string;
  askedAt: string;
  askedBy: string;
  question: string;
  status: PrinterCheckStatus;
  answeredAt: string | null;
  answeredBy: string | null;
  answerNote: string;
  /** Gezet zodra Noviply is gaan printen; daarmee is de uitwisseling voorbij. */
  closedAt: string | null;
};

export class PrinterCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrinterCheckError";
  }
}

/**
 * Wie zegt dat de printer niet klaarstaat, moet zeggen waarom. Anders weet
 * Noviply niet of ze over vijf minuten of over een dag kunnen printen.
 */
export function validateAnswer(status: Exclude<PrinterCheckStatus, "pending">, note: string) {
  const trimmed = note.trim();
  if (status === "blocked" && trimmed.length < 3) {
    throw new PrinterCheckError("Zeg kort waarom de printer niet klaarstaat.");
  }
  return trimmed;
}

/**
 * Hoe lang een antwoord van de werkvloer meegaat.
 *
 * "De printer staat klaar" is waar op het moment dat iemand ernaar keek. Die
 * printer staat in een ruimte waar de hele dag mensen langslopen: hij kan
 * uitgezet zijn, leeg zijn, of net gebruikt. Na een half uur is "hij stond
 * klaar" geen mededeling meer maar een gok, en dan hoor je opnieuw te vragen in
 * plaats van een groen vinkje te blijven zien.
 */
export const answerValidMinutes = 30;

/**
 * Hoe lang een onbeantwoorde vraag blijft staan. Korter, want dit gaat over
 * iemand die nu op antwoord wacht. Komt er een kwartier niets, dan is de
 * werkvloer ergens anders mee bezig en heeft opnieuw vragen meer zin dan blijven
 * staan op "wachten".
 */
export const questionValidMinutes = 15;

function binnen(moment: string | null | undefined, now: Date, minuten: number) {
  if (!moment) return false;
  const tijd = new Date(moment).getTime();
  if (Number.isNaN(tijd)) return false;
  return now.getTime() - tijd < minuten * 60_000;
}

export function openCheck(checks: PrinterCheckRecord[], now = new Date()) {
  return checks.find(
    (check) => check.status === "pending" && binnen(check.askedAt, now, questionValidMinutes),
  ) ?? null;
}

/**
 * Het antwoord dat nog geldt. Zodra Noviply is gaan printen vervalt het: laten
 * staan zou suggereren dat de printer nog klaarstaat, terwijl er ondertussen
 * materiaal doorheen is gegaan.
 */
export function latestAnswered(checks: PrinterCheckRecord[], now = new Date()) {
  return [...checks]
    .filter((check) => check.status !== "pending"
      && check.answeredAt
      && !check.closedAt
      // Een antwoord van een uur geleden zegt niets meer over nu.
      && binnen(check.answeredAt, now, answerValidMinutes))
    .sort((left, right) => (right.answeredAt ?? "").localeCompare(left.answeredAt ?? ""))[0] ?? null;
}

/** Kan Noviply nu beginnen? Alleen als de werkvloer ja zei en er nog niet is geprint. */
export function readyToPrint(checks: PrinterCheckRecord[], now = new Date()) {
  const answer = latestAnswered(checks, now);
  return answer && answer.status === "ready" ? answer : null;
}

/**
 * Hoe lang "Noviply print nu" op de werkvloer blijft staan. Kort: het is een
 * seintje dat de printer draait, geen mededeling die de hele dag moet blijven
 * hangen — anders leest niemand hem meer.
 */
export const printingVisibleMinutes = 5;

/**
 * Noviply is net begonnen met printen. De werkvloer hoort dat te weten: die
 * hoort de printer draaien en moet niet denken dat er iets misgaat, en weet
 * meteen dat er zo iets klaarligt.
 */
export function printingNow(checks: PrinterCheckRecord[], now: Date) {
  return [...checks]
    .filter((check) => check.status === "ready" && check.closedAt)
    .sort((left, right) => (right.closedAt ?? "").localeCompare(left.closedAt ?? ""))
    .find((check) => {
      const started = new Date(check.closedAt!).getTime();
      if (Number.isNaN(started)) return false;
      return now.getTime() - started < printingVisibleMinutes * 60_000;
    }) ?? null;
}

export function printerCheckStatusLabel(status: PrinterCheckStatus) {
  if (status === "ready") return "Printer staat klaar";
  if (status === "blocked") return "Printer staat niet klaar";
  return "Vraag staat open";
}
