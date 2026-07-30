/**
 * De twee vaste printrondes.
 *
 * Noviply print twee keer per dag automatisch wat er aan buitenlandse orders
 * binnenkomt. Een order die tussen twee rondes in besteld en klaargemaakt
 * wordt, komt dus vanzelf mee met de eerstvolgende ronde — daar hoeft niemand
 * iets voor aan te vragen. Deed de werkvloer dat toch, dan printte Noviply
 * hetzelfde vel twee keer.
 *
 * Het onderscheid zit in de datum op de pakbon: staat daar vandaag, dan is de
 * order van na de vorige ronde en komt hij met de volgende mee. Staat er een
 * eerdere datum, dan had hij er al moeten liggen en is er echt iets misgegaan.
 */

/** Een tijdstip op de dag, als "HH:MM". */
export type PrintRunTimes = {
  morning: string;
  afternoon: string;
};

export const defaultPrintRunTimes: PrintRunTimes = {
  morning: "09:00",
  afternoon: "12:30",
};

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isPrintRunTime(value: string) {
  return timePattern.test(value.trim());
}

/** Het tijdstip van vandaag, uitgedrukt in de klok van wie ernaar kijkt. */
function todayAt(time: string, now: Date) {
  const match = timePattern.exec(time.trim());
  if (!match) return null;
  const moment = new Date(now);
  moment.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return moment;
}

export type PrintRun = {
  /** Wanneer de ronde loopt. */
  at: Date;
  /** Hoe je hem noemt tegen de werkvloer: "12:30". */
  label: string;
  which: "morning" | "afternoon";
};

/**
 * De eerstvolgende ronde van vandaag, of niets als beide al geweest zijn.
 *
 * Bewust alleen vandaag: "hij komt morgenochtend wel" is geen antwoord waar
 * iemand met een laptop in zijn hand iets aan heeft. Dan is aanvragen beter.
 */
export function nextPrintRun(now: Date, times: PrintRunTimes | undefined): PrintRun | null {
  // Een beleidsversie van vóór de rondes kent deze tijden niet. Dan de vaste
  // tijden aanhouden: de werkvloer mag hier nooit op stukvallen.
  const { morning: morningTime, afternoon: afternoonTime } = times ?? defaultPrintRunTimes;
  const candidates: PrintRun[] = [];
  const morning = todayAt(morningTime ?? "", now);
  const afternoon = todayAt(afternoonTime ?? "", now);
  if (morning) candidates.push({ at: morning, label: morningTime.trim(), which: "morning" });
  if (afternoon) candidates.push({ at: afternoon, label: afternoonTime.trim(), which: "afternoon" });

  return candidates
    .filter((run) => run.at.getTime() > now.getTime())
    .sort((left, right) => left.at.getTime() - right.at.getTime())[0] ?? null;
}

/** Of de ronde waarop iemand wacht inmiddels geweest is. */
export function runHasPassed(expectedRunAt: string, now: Date) {
  const moment = new Date(expectedRunAt);
  if (Number.isNaN(moment.getTime())) return false;
  return moment.getTime() <= now.getTime();
}
