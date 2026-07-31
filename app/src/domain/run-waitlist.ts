import type { TrackpointAnswer } from "./print-requests";
import { runHasPassed } from "./print-runs";

/**
 * Laptops die apart staan omdat hun vel met de volgende printronde meekomt.
 *
 * Zonder deze lijst zou "leg apart en kijk straks nog eens" een mededeling
 * zijn die niemand bijhoudt: de laptop staat op een kar, de medewerker gaat
 * verder, en niemand weet later nog welke er stonden. Daarom staat het hier,
 * gedeeld met de hele werkvloer, tot iemand zegt dat het vel er is — of dat
 * het er níét is, en dan gaat er alsnog een aanvraag naar Noviply.
 */

export type RunWaitlistStatus = "waiting" | "collected" | "escalated";

export type RunWaitlistEntry = {
  id: string;
  model: string;
  layout: string;
  variant: string;
  orderReference: string;
  /** Aantal laptops onder dit ordernummer. */
  quantity: number;
  /** Wanneer de ronde loopt waar dit vel mee mee zou komen. */
  expectedRunAt: string;
  /** Hoe die ronde heet tegen de werkvloer: "12:30". */
  expectedRunLabel: string;
  /** Het antwoord op de trackpointvraag; gaat mee als hij alsnog aangevraagd wordt. */
  trackpoint: TrackpointAnswer;
  createdAt: string;
  createdBy: string;
  status: RunWaitlistStatus;
  settledAt: string | null;
  settledBy: string | null;
};

export type RunWaitlistInput = {
  model: string;
  layout: string;
  variant: string;
  orderReference: string;
  quantity: number;
  expectedRunAt: string;
  expectedRunLabel: string;
  trackpoint?: TrackpointAnswer;
};

export class RunWaitlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunWaitlistError";
  }
}

/**
 * Twee stapels: waar nog niets van te zeggen valt, en waar de ronde inmiddels
 * voor geweest is. Die tweede is het enige waar de werkvloer iets mee moet.
 */
export function groupRunWaitlist(entries: RunWaitlistEntry[], now: Date) {
  const open = entries.filter((entry) => entry.status === "waiting");
  return {
    due: open
      .filter((entry) => runHasPassed(entry.expectedRunAt, now))
      .sort((left, right) => left.expectedRunAt.localeCompare(right.expectedRunAt)),
    pending: open
      .filter((entry) => !runHasPassed(entry.expectedRunAt, now))
      .sort((left, right) => left.expectedRunAt.localeCompare(right.expectedRunAt)),
  };
}

/** Hoeveel laptops er nu apart staan te wachten. */
export function waitingForRunCount(entries: RunWaitlistEntry[]) {
  return entries.filter((entry) => entry.status === "waiting").length;
}

export function createRunWaitlistEntry(
  input: RunWaitlistInput,
  actor: string,
  now: Date,
): RunWaitlistEntry {
  const orderReference = input.orderReference.trim();
  if (!orderReference) {
    // Zonder ordernummer is het straks niet terug te vinden op de kar.
    throw new RunWaitlistError("Vul het ordernummer in, anders is deze laptop straks niet terug te vinden.");
  }
  if (!input.model.trim()) {
    throw new RunWaitlistError("Kies eerst een model.");
  }
  const expected = new Date(input.expectedRunAt);
  if (Number.isNaN(expected.getTime())) {
    throw new RunWaitlistError("De printronde is niet bekend.");
  }

  return {
    id: `${orderReference}-${expected.toISOString()}`,
    model: input.model.trim(),
    layout: input.layout.trim(),
    variant: input.variant.trim(),
    orderReference,
    quantity: Math.max(1, Math.round(input.quantity || 1)),
    expectedRunAt: expected.toISOString(),
    expectedRunLabel: input.expectedRunLabel.trim(),
    trackpoint: input.trackpoint ?? "unknown",
    createdAt: now.toISOString(),
    createdBy: actor,
    status: "waiting",
    settledAt: null,
    settledBy: null,
  };
}
