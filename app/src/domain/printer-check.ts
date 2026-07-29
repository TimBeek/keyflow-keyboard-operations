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

export function openCheck(checks: PrinterCheckRecord[]) {
  return checks.find((check) => check.status === "pending") ?? null;
}

/** De laatst beantwoorde vraag, voor het bericht aan Noviply. */
export function latestAnswered(checks: PrinterCheckRecord[]) {
  return [...checks]
    .filter((check) => check.status !== "pending" && check.answeredAt)
    .sort((left, right) => (right.answeredAt ?? "").localeCompare(left.answeredAt ?? ""))[0] ?? null;
}

export function printerCheckStatusLabel(status: PrinterCheckStatus) {
  if (status === "ready") return "Printer staat klaar";
  if (status === "blocked") return "Printer staat niet klaar";
  return "Vraag staat open";
}
