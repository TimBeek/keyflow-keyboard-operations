import { batchLabel, type PrintBatch } from "./print-batch";
import {
  layoutKey,
  modelKey,
  type NoviplyUnavailableRecord,
  type UnavailableReason,
} from "./noviply-availability";
import type { PrintRequestRecord } from "./print-requests";

/**
 * Wat wij weten over "kan Noviply dit printen", uit alle bronnen tegelijk.
 *
 * Deze kennis lag verspreid over drie plekken die elkaar niet kenden: de
 * blokkadetabel (alleen gevuld vanuit losse aanvragen), de afgehandelde
 * aanvragen zelf, en de regels uit de printrondes — verreweg het grootste deel
 * van het werk. Elk scherm keek naar een andere plek. De werkvloer kreeg een
 * premiumsticker aangeraden voor een model dat Noviply die ochtend nog had
 * afgekeurd, Noviply's eigen lijst toonde een fractie van wat zij hadden
 * gemeld, en management zag bij de ene regel wel een knop om het terug te
 * draaien en bij de andere niet.
 *
 * Eén sleutel, één antwoord: model + taal. Alles wat over dezelfde combinatie
 * gaat komt op één regel, met de ordernummers erbij.
 */

export type VerdictSource = "block" | "request" | "run";

export type PrintVerdict = {
  /** `${modelKey}|${layoutKey}`; met lege taal betekent het het hele model. */
  key: string;
  model: string;
  /** Leeg betekent: geldt voor elke taal van dit model. */
  layout: string;
  /**
   * Het id van de openstaande blokkade, als die er is.
   *
   * Alleen dán stopt het advies aan de werkvloer, en alleen dán valt er iets in
   * te trekken. Staat hier null, dan is dit geschiedenis: het is een keer
   * misgegaan, maar de app biedt het gewoon weer aan.
   */
  blockId: string | null;
  reason: UnavailableReason | null;
  note: string;
  /** Wanneer dit voor het laatst speelde. */
  when: string;
  source: VerdictSource;
  /** Waar het vandaan komt: "Morning run · 7 Aug", "Print request", of leeg. */
  sourceLabel: string;
  /** Elke order die hierop is vastgelopen, nieuwste eerst. */
  orders: string[];
};

/** De modelbrede sleutel; een blokkade zonder taal valt hieronder. */
function sleutel(model: string, layout: string) {
  const m = modelKey(model);
  if (!m) return "";
  return `${m}|${layoutKey(layout)}`;
}

type Bouwsteen = {
  model: string;
  layout: string;
  note: string;
  when: string;
  source: VerdictSource;
  sourceLabel: string;
  order: string;
  /** Is dit een geslaagde print? Die wist een eerdere afkeuring uit. */
  printed: boolean;
};

function uitBronnen(
  batches: PrintBatch[],
  requests: PrintRequestRecord[],
): Bouwsteen[] {
  const uitAanvragen = requests
    /*
     * Alleen wat Noviply werkelijk heeft afgehandeld. Een ingetrokken aanvraag
     * heeft Noviply nooit gezien — die trekt de werkvloer zelf in omdat de
     * laptop al af was — en die mocht hier eerst als "kon niet printen"
     * binnenkomen. Dan stond er een verzonnen regel op hun eigen scherm, en
     * verdrong die met zijn verse tijdstip nog de echte reden van een oudere
     * afkeuring.
     */
    .filter((request) => request.status === "printed" || request.status === "not_printable")
    .map((request): Bouwsteen => ({
      model: request.model,
      layout: request.layout,
      note: request.note,
      when: request.handledAt ?? request.requestedAt,
      source: "request",
      sourceLabel: "Print request",
      order: request.orderReference,
      printed: request.status === "printed",
    }));

  /*
   * Bewust ook de rondes die uit de lijst zijn gehaald. Een ronde weghalen is
   * opruimen van je werklijst, geen verklaring dat het toch printbaar was — en
   * juist daar zitten de afkeuringen in. De geschiedenis doet dit al net zo.
   */
  const uitRondes = batches.flatMap((batch) => batch.rows
    .filter((row) => row.status !== "open")
    .map((row): Bouwsteen => ({
      model: row.model,
      layout: row.layout || row.languageCode,
      note: row.note,
      when: row.handledAt ?? "",
      source: "run",
      sourceLabel: batchLabel(batch, "en"),
      order: row.orderReference,
      printed: row.status === "printed",
    })));

  return [...uitAanvragen, ...uitRondes];
}

/**
 * Alles wat Noviply niet kon printen, één regel per model + taal.
 *
 * Een latere geslaagde print laat een oude afkeuring vervallen — het is dus
 * gelukt. De uitzondering is een openstaande blokkade: die vervalt alleen
 * doordat iemand hem intrekt, want dat is een uitspraak over de toekomst en
 * geen waarneming over één order.
 */
export function printVerdicts(
  batches: PrintBatch[],
  requests: PrintRequestRecord[],
  unavailable: NoviplyUnavailableRecord[],
): PrintVerdict[] {
  const bouwstenen = uitBronnen(batches, requests)
    .filter((steen) => sleutel(steen.model, steen.layout) !== "")
    .sort((links, rechts) => rechts.when.localeCompare(links.when));

  const perSleutel = new Map<string, PrintVerdict>();
  // Waar het laatst wél is geprint; dat wist een oudere afkeuring uit.
  const laatstGeprint = new Map<string, string>();

  for (const steen of bouwstenen) {
    const key = sleutel(steen.model, steen.layout);
    if (steen.printed) {
      if (!laatstGeprint.has(key)) laatstGeprint.set(key, steen.when);
      continue;
    }
    const bestaand = perSleutel.get(key);
    if (bestaand) {
      if (steen.order && !bestaand.orders.includes(steen.order)) {
        bestaand.orders.push(steen.order);
      }
      continue;
    }
    perSleutel.set(key, {
      key,
      model: steen.model,
      layout: steen.layout,
      blockId: null,
      reason: null,
      note: steen.note,
      when: steen.when,
      source: steen.source,
      sourceLabel: steen.sourceLabel,
      orders: steen.order ? [steen.order] : [],
    });
  }

  // Een afkeuring die later alsnog geprint is, telt niet meer mee.
  for (const [key, geprintOp] of laatstGeprint) {
    const oordeel = perSleutel.get(key);
    if (oordeel && geprintOp > oordeel.when) perSleutel.delete(key);
  }

  /*
   * De blokkades er als laatste overheen. Zij winnen altijd: ze zeggen iets
   * over morgen, niet over die ene order, en ze zijn de enige regels die het
   * advies aan de werkvloer echt stilzetten.
   */
  for (const blokkade of unavailable) {
    const key = sleutel(blokkade.model, blokkade.layout);
    if (!key) continue;
    const bestaand = perSleutel.get(key);
    perSleutel.set(key, {
      key,
      model: blokkade.model,
      layout: blokkade.layout,
      blockId: blokkade.id,
      reason: blokkade.reason,
      note: blokkade.note,
      when: blokkade.recordedAt,
      source: "block",
      sourceLabel: bestaand?.sourceLabel ?? "",
      orders: bestaand?.orders ?? [],
    });
  }

  return [...perSleutel.values()].sort((links, rechts) => {
    // Wat het advies stilzet eerst; daarbinnen het meest recente bovenaan.
    if (Boolean(links.blockId) !== Boolean(rechts.blockId)) return links.blockId ? -1 : 1;
    return rechts.when.localeCompare(links.when);
  });
}

export type PrintVerdictIndex = Map<string, PrintVerdict>;

/** Eén keer opbouwen, daarna per regel opzoeken. */
export function printVerdictIndex(verdicts: PrintVerdict[]): PrintVerdictIndex {
  return new Map(verdicts.map((oordeel) => [oordeel.key, oordeel]));
}

/**
 * Wat weten wij over dit model in deze taal?
 *
 * Eerst het model als geheel: kennen ze het toetsenbord helemaal niet, dan
 * maakt de taal niet meer uit. Daarna deze ene taal.
 */
export function printVerdictFor(
  index: PrintVerdictIndex,
  model: string,
  layout: string,
): PrintVerdict | null {
  const m = modelKey(model);
  if (!m) return null;
  const modelbreed = index.get(`${m}|`) ?? null;
  const dezeTaal = index.get(`${m}|${layoutKey(layout)}`) ?? null;
  /*
   * Wat het advies stilzet weegt het zwaarst. Modelbreed ging altijd voor, maar
   * een modelbrede regel hoeft geen blokkade te zijn — het kan ook een oude
   * mededeling zijn dat het één keer misging. Die verborg dan een lopende
   * blokkade op precies deze taal, en dat is nu juist wat je moet weten.
   */
  if (modelbreed?.blockId) return modelbreed;
  if (dezeTaal?.blockId) return dezeTaal;
  return modelbreed ?? dezeTaal;
}
