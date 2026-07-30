/**
 * Rapportage beantwoordt drie vragen en niet meer: hoeveel conversies doen we
 * per dag, welke hangmappen lopen hard of stil, en loopt het verbruik op of
 * terug. Alles rekent met echte registraties. Er zit bewust geen prognosemodel
 * in: zonder maanden historie is elke voorspelling een gok met een net jasje.
 */

import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import type { ConversionLogEntry } from "./conversion-log";
import { inventoryQuantity } from "./inventory-quantities";
import type { InventoryTransactionEntry, OperationalMethodId } from "./operations";

export const reportPeriods = [
  { id: "week", label: "7 dagen", days: 7 },
  { id: "month", label: "4 weken", days: 28 },
  { id: "quarter", label: "3 maanden", days: 91 },
] as const;

export type ReportPeriodId = (typeof reportPeriods)[number]["id"];

export function getReportPeriod(id: ReportPeriodId) {
  return reportPeriods.find((period) => period.id === id) ?? reportPeriods[0];
}

/**
 * Registraties staan in UTC, maar een medewerker denkt in zijn eigen dag. We
 * rekenen daarom met de lokale kalenderdag, anders valt vroeg werk in de
 * verkeerde kolom.
 */
export function dayKey(value: string | Date) {
  const moment = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(moment.getTime())) return "";
  return [
    moment.getFullYear(),
    String(moment.getMonth() + 1).padStart(2, "0"),
    String(moment.getDate()).padStart(2, "0"),
  ].join("-");
}

export function shiftDayKey(key: string, deltaDays: number) {
  const [year, month, day] = key.split("-").map(Number);
  return dayKey(new Date(year, month - 1, day + deltaDays));
}

export function daysBetween(fromDay: string, toDay: string) {
  const [fromYear, fromMonth, fromDate] = fromDay.split("-").map(Number);
  const [toYear, toMonth, toDate] = toDay.split("-").map(Number);
  const from = Date.UTC(fromYear, fromMonth - 1, fromDate);
  const to = Date.UTC(toYear, toMonth - 1, toDate);
  return Math.round((to - from) / 86_400_000);
}

export type PeriodWindow = { start: string; end: string };

export function periodWindow(days: number, today: string) {
  return {
    current: { start: shiftDayKey(today, -(days - 1)), end: today },
    previous: { start: shiftDayKey(today, -(2 * days - 1)), end: shiftDayKey(today, -days) },
  };
}

function inWindow(occurredAt: string, window: PeriodWindow) {
  const key = dayKey(occurredAt);
  return key !== "" && key >= window.start && key <= window.end;
}

/**
 * De Excel-import boekte twaalf weken verbruik weg op één dag. Dat is een
 * beginstand, geen werkdag — in een dagverloop zou het een piek tekenen die
 * nooit heeft plaatsgevonden.
 */
function measurable(entry: InventoryTransactionEntry) {
  return entry.aggregated !== true;
}

function issuedUnits(transactions: InventoryTransactionEntry[], window: PeriodWindow) {
  return transactions
    .filter((entry) => measurable(entry) && entry.type === "issue" && inWindow(entry.occurredAt, window))
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);
}

export function changePercentage(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/* ---------- vraag 1: hoeveel conversies per dag ---------- */

export type ConversionDay = {
  day: string;
  total: number;
  byMethod: Record<OperationalMethodId, number>;
};

const methodOrder: OperationalMethodId[] = [
  "loose_stickers",
  "noviply_sheet",
  "printed_sticker",
  "direct_reprint",
];

const emptyMethodTally = (): Record<OperationalMethodId, number> => ({
  loose_stickers: 0,
  noviply_sheet: 0,
  printed_sticker: 0,
  direct_reprint: 0,
});

/**
 * Eén regel kan meerdere laptops zijn. De vraag is altijd "hoeveel laptops",
 * niet "hoeveel keer heeft iemand op een knop gedrukt" — dus tellen we het
 * aantal en niet de regels. Regels van vóór dit veld tellen als één.
 */
function units(entry: ConversionLogEntry) {
  return Math.max(1, Math.round(entry.quantity || 1));
}

function totalUnits(entries: ConversionLogEntry[]) {
  return entries.reduce((sum, entry) => sum + units(entry), 0);
}

export function conversionsPerDay(
  entries: ConversionLogEntry[],
  days: number,
  today: string,
): ConversionDay[] {
  const buckets = new Map<string, ConversionDay>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDayKey(today, -offset);
    buckets.set(day, { day, total: 0, byMethod: emptyMethodTally() });
  }

  for (const entry of entries) {
    const bucket = buckets.get(dayKey(entry.occurredAt));
    if (!bucket) continue;
    bucket.total += units(entry);
    bucket.byMethod[entry.method] += units(entry);
  }

  return [...buckets.values()];
}

export type ConversionBucket = {
  startDay: string;
  endDay: string;
  dayCount: number;
  total: number;
  byMethod: Record<OperationalMethodId, number>;
};

/**
 * Een kwartaal is 91 staafjes breed en dan valt er niets meer af te lezen.
 * Boven een leesbaar aantal kolommen vatten we dagen samen tot blokken.
 */
export function bucketConversionDays(
  days: ConversionDay[],
  maxColumns: number,
): ConversionBucket[] {
  if (days.length === 0 || maxColumns < 1) return [];
  const size = Math.ceil(days.length / maxColumns);
  const buckets: ConversionBucket[] = [];

  for (let index = 0; index < days.length; index += size) {
    const slice = days.slice(index, index + size);
    const byMethod = emptyMethodTally();
    for (const day of slice) {
      for (const method of methodOrder) byMethod[method] += day.byMethod[method];
    }
    buckets.push({
      startDay: slice[0].day,
      endDay: slice[slice.length - 1].day,
      dayCount: slice.length,
      total: slice.reduce((sum, day) => sum + day.total, 0),
      byMethod,
    });
  }

  return buckets;
}

export type ConversionTotals = {
  current: number;
  previous: number;
  delta: number;
  deltaPercentage: number | null;
  completed: number;
  awaitingPrint: number;
  activeDays: number;
  perActiveDay: number;
};

export function conversionTotals(
  entries: ConversionLogEntry[],
  days: number,
  today: string,
): ConversionTotals {
  const window = periodWindow(days, today);
  const current = entries.filter((entry) => inWindow(entry.occurredAt, window.current));
  const previous = entries.filter((entry) => inWindow(entry.occurredAt, window.previous));
  // Delen door alle dagen in de periode drukt het gemiddelde omlaag met
  // weekenden en vrije dagen. De vraag is hoeveel er op een werkdag gebeurt.
  const activeDays = new Set(current.map((entry) => dayKey(entry.occurredAt))).size;

  const currentUnits = totalUnits(current);
  const previousUnits = totalUnits(previous);

  return {
    current: currentUnits,
    previous: previousUnits,
    delta: currentUnits - previousUnits,
    deltaPercentage: changePercentage(currentUnits, previousUnits),
    completed: totalUnits(current.filter((entry) => entry.status === "completed")),
    awaitingPrint: totalUnits(current.filter((entry) => entry.status === "awaiting_print")),
    activeDays,
    perActiveDay: activeDays === 0 ? 0 : currentUnits / activeDays,
  };
}

export type MethodShare = {
  method: OperationalMethodId;
  current: number;
  previous: number;
  share: number;
  delta: number;
};

export function methodShares(
  entries: ConversionLogEntry[],
  days: number,
  today: string,
): MethodShare[] {
  const window = periodWindow(days, today);
  const current = entries.filter((entry) => inWindow(entry.occurredAt, window.current));
  const previous = entries.filter((entry) => inWindow(entry.occurredAt, window.previous));

  return methodOrder.map((method) => {
    const currentCount = totalUnits(current.filter((entry) => entry.method === method));
    const previousCount = totalUnits(previous.filter((entry) => entry.method === method));
    const currentTotal = totalUnits(current);
    return {
      method,
      current: currentCount,
      previous: previousCount,
      share: currentTotal === 0 ? 0 : (currentCount / currentTotal) * 100,
      delta: currentCount - previousCount,
    };
  });
}

/* ---------- vraag 2: welke hangmappen lopen hard of stil ---------- */

export type MoverRow = {
  catalogKey: string;
  storageNumber: number;
  sku: string;
  model: string;
  layout: string;
  used: number;
  previousUsed: number;
  delta: number;
  stock: number;
  /** Hoe lang de huidige voorraad meegaat bij dit tempo; null zonder verbruik. */
  weeksOfStock: number | null;
};

export function moverRanking(
  transactions: InventoryTransactionEntry[],
  catalog: InventoryCatalogItem[],
  quantities: Record<string, number>,
  days: number,
  today: string,
): MoverRow[] {
  const window = periodWindow(days, today);
  const weeks = days / 7;

  const usageFor = (item: InventoryCatalogItem, period: PeriodWindow) => transactions
    .filter((entry) =>
      measurable(entry)
      && entry.type === "issue"
      && inWindow(entry.occurredAt, period)
      && (entry.catalogKey ? entry.catalogKey === item.catalogKey : entry.sku === item.sku))
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);

  return catalog
    .filter((item) => item.dataQuality === "ready")
    .map((item) => {
      const used = usageFor(item, window.current);
      const previousUsed = usageFor(item, window.previous);
      const stock = inventoryQuantity(quantities, item);
      const perWeek = used / weeks;
      return {
        catalogKey: item.catalogKey,
        storageNumber: item.storageNumber,
        sku: item.sku,
        model: item.model,
        layout: item.layout,
        used,
        previousUsed,
        delta: used - previousUsed,
        stock,
        weeksOfStock: perWeek > 0 ? stock / perWeek : null,
      };
    })
    .sort((left, right) => right.used - left.used || left.storageNumber - right.storageNumber);
}

/* ---------- vraag 3: loopt het verbruik op of terug ---------- */

export type ConsumptionTrend = {
  current: number;
  previous: number;
  delta: number;
  deltaPercentage: number | null;
};

export function consumptionTrend(
  transactions: InventoryTransactionEntry[],
  days: number,
  today: string,
): ConsumptionTrend {
  const window = periodWindow(days, today);
  const current = issuedUnits(transactions, window.current);
  const previous = issuedUnits(transactions, window.previous);

  return {
    current,
    previous,
    delta: current - previous,
    deltaPercentage: changePercentage(current, previous),
  };
}

/* ---------- hoeveel historie hebben we eigenlijk ---------- */

export function historyDepthDays(records: { occurredAt: string }[], today: string) {
  const keys = records.map((record) => dayKey(record.occurredAt)).filter(Boolean).sort();
  if (keys.length === 0) return 0;
  return Math.max(0, daysBetween(keys[0], today));
}

/** De beginstand uit de import, apart getoond zodat niemand hem voor dagwerk aanziet. */
export function importedBaselineUnits(transactions: InventoryTransactionEntry[]) {
  return transactions
    .filter((entry) => entry.aggregated === true && entry.type === "issue")
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);
}
