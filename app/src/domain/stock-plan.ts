import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { inventoryQuantity } from "./inventory-quantities";
import { isRealUsage } from "./real-usage";
import { layoutWithCountry, type InventoryTransactionEntry } from "./operations";

/**
 * Wat Noviply moet leveren, en waarom.
 *
 * Het voorraadscherm toonde getallen zonder gevolg: verbruik per week, voorraad,
 * een streepje bij het minimum. Een leverancier kan daar niets mee. Hij wil drie
 * dingen weten: wat raakt op, hoeveel moet ik sturen, en wanneer moet het weg.
 *
 * Dit is de enige plek waar dat wordt uitgerekend. Het Engelse scherm van
 * Noviply en het Nederlandse van management zijn twee gezichten op dezelfde
 * getallen; zodra ze los gaan rekenen krijg je ruzie over cijfers.
 *
 * WAT DEZE CIJFERS WEL EN NIET ZIJN
 *
 * Het verbruik is telwerk en klopt tot op het vel. De vertaling naar "per week"
 * is een schatting, en bij deze aantallen een grove: van vijf geziene vellen
 * loopt het echte tempo ergens tussen twee en twaalf per week. Daarom staat er
 * overal een band naast het getal en nergens een decimaal. Een keurige "3,89
 * per week" suggereert een precisie die er niet is.
 *
 * De verdeling is bewust Poisson en niet normaal. Zeven van de tien dagen wordt
 * een vel helemaal niet gebruikt; de gebruikelijke veiligheidsvoorraadformule
 * met een standaardafwijking gaat uit van een klokkromme en zit er bij zulke
 * hortende vraag stelselmatig te laag naast. Bij tellen met veel nullen is
 * Poisson de eerlijke aanname, en die geeft bovendien hele vellen terug in
 * plaats van 6,73.
 */

/* ---------- beleid ---------- */

export type StockPolicy = {
  /** Levertijd van Noviply in dagen. */
  leadTimeDays: number;
  /**
   * Hoe vaak er wordt besteld, in dagen. De knop voor de batchgrootte.
   *
   * Dit hoort in de dekking meegerekend: je moet het overbruggen tot de
   * levering ná de volgende bestelronde, niet alleen tot de eerstvolgende.
   * Daardoor is dit tegelijk de enige knop die de bestelling echt groter maakt
   * — verdubbel de ronde en je verdubbelt de order.
   *
   * Doorgerekend op ons eigen verbruik, met de vraag onveranderd: elke week
   * bestellen geeft 52 orders per jaar van 95 vellen, elke vier weken 13 orders
   * van 385 vellen, elke zes weken 9 orders van 577. Het aandeel vraag dat
   * misgrijpt blijft in alle drie de gevallen rond een half procent; wat er
   * verandert is de voorraad die je aanhoudt.
   */
  orderCycleDays: number;
  /** Extra marge bovenop, in dagen. */
  safetyDays: number;
  /**
   * Hoe ver vooruit een regel mag meeliften, in werkdagen.
   *
   * Er gaat toch een order uit; wat binnen deze termijn tóch aan de beurt komt
   * kan er net zo goed bij. Kleiner dan de bestelronde houden, anders tel je
   * dezelfde vooruitblik twee keer en bestel je fors te veel.
   */
  canOrderDays: number;
  /**
   * Niet minder dan dit van één artikel bestellen.
   *
   * Drie velletjes laten drukken is zonde van de opstelling. Alleen voor regels
   * waar genoeg verbruik onder zit — een ondergrens op een hangmap waar één vel
   * uit is gegaan maakt geen batch maar dode voorraad. Bewust een ondergrens en
   * geen afronding op tientallen: dat laatste tilt ook de grote regels op die
   * het niet nodig hebben, en kost bij hetzelfde effect het dubbele.
   */
  minLineQuantity: number;
};

export const defaultStockPolicy: StockPolicy = {
  // Noviply levert naar eigen zeggen in ongeveer anderhalve week.
  leadTimeDays: 11,
  orderCycleDays: 28,
  safetyDays: 7,
  canOrderDays: 10,
  minLineQuantity: 10,
};

/**
 * Waarboven een ondergrens per regel alleen maar voorraad wordt.
 *
 * Tien vellen op een hangmap die er twee per week gebruikt is vijf weken; op
 * een hangmap die er een half per week gebruikt is het twintig weken. Die
 * tweede hoort de ondergrens niet te krijgen.
 */
const maxDekkingWerkdagen = 60;

/** Onder dit aantal geziene vellen valt geen tempo af te leiden. */
const genoegGezien = 3;

/** Werkdagen per week; de werkvloer draait niet in het weekend. */
const werkdagenPerWeek = 5;

/**
 * Over hoeveel weken het verbruik wordt geteld.
 *
 * Lang genoeg om iets te zien, kort genoeg om een model dat uit productie gaat
 * vanzelf te laten wegzakken.
 */
export const usageWindowDays = 56;

/**
 * De laatste twee weken tellen dubbel.
 *
 * Het aandeel werk dat via een vel gaat liep in drie weken van 17 naar 100
 * procent: er werd overgestapt van zelf printen naar de vellen van Noviply. Een
 * gemiddelde over het hele venster weegt de tijd mee waarin die overstap nog
 * niet gemaakt was, en bestelt daardoor structureel te weinig.
 */
export const recentDays = 14;
const recentGewicht = 2;

/* ---------- de uitkomst ---------- */

export type StockStatus =
  /** Niets meer in de hangmap. */
  | "out"
  /** Raakt leeg voordat een bestelling van vandaag binnen is. */
  | "critical"
  /** Onder het bestelpunt: nu bestellen, anders red je de volgende ronde niet. */
  | "order"
  /** Nog boven het bestelpunt, maar niet lang meer. */
  | "watch"
  /** Genoeg, en het loopt. */
  | "ok"
  /** Er ligt voorraad en er is in het hele venster niets gebruikt. */
  | "idle";

/** Hoe hard het cijfer is. Naar het aantal geziene vellen, niet naar dagen. */
export type DemandConfidence = "measured" | "estimate" | "rough" | "none";

export type StockPlanRow = {
  catalogKey: string;
  storageNumber: number;
  sku: string;
  /** Het nummer is van onszelf; Noviply kan dit niet leveren. */
  ownNumber: boolean;
  /** Ditzelfde nummer ligt ook in een andere hangmap. */
  sharedNumber: boolean;
  model: string;
  /** Hoeveel laptopmodellen dit vel bedient. */
  compatibleModels: number;
  layout: string;
  variant: string;
  /** Opmerking uit de bronlijst; vaak feedback over het vel zelf. */
  note: string;

  /** Vellen in de hangmap. */
  stock: number;
  /** Vellen gebruikt binnen het venster; telwerk, geen schatting. */
  used: number;
  /** Werkdagen sinds het laatste gebruik; null als er nooit iets is gebruikt. */
  daysSinceUse: number | null;

  /** Geschat verbruik per week, of null als er niets is gebruikt. */
  perWeek: number | null;
  /** De ondergrens van wat dat tempo kan zijn. */
  perWeekLow: number | null;
  /** De bovengrens. */
  perWeekHigh: number | null;
  confidence: DemandConfidence;

  /** Vanaf hier bestellen: verbruik tijdens levertijd, ronde en marge. */
  reorderPoint: number | null;
  /** Tot dit niveau aanvullen. */
  orderUpTo: number | null;
  /** Wat er nu besteld zou moeten worden. */
  suggested: number;
  /** Werkdagen tot de hangmap leeg is; null zonder verbruik. */
  workingDaysLeft: number | null;
  /**
   * Werkdagen tot het bestelpunt bereikt is — daarna eet je je marge op.
   * Nul of negatief betekent: had al besteld moeten zijn.
   */
  orderWithinDays: number | null;
  status: StockStatus;
};

/* ---------- de band om een telling ---------- */

/**
 * Het betrouwbaarheidsinterval rond een aantal getelde gebeurtenissen.
 *
 * Wilson–Hilferty: de gangbare benadering van het exacte Poisson-interval, goed
 * genoeg voor kleine aantallen en zonder tabel uit te rekenen. Van vijf geziene
 * vellen loopt de band van ongeveer 1,6 tot 11,7 — dat is de eerlijke marge, en
 * precies waarom er geen decimaal op het scherm hoort.
 */
export function poissonRange(count: number): { low: number; high: number } {
  if (count <= 0) return { low: 0, high: 3.69 };
  const z = 1.96;
  const low = count * (1 - 1 / (9 * count) - z / (3 * Math.sqrt(count))) ** 3;
  const hoger = count + 1;
  const high = hoger * (1 - 1 / (9 * hoger) + z / (3 * Math.sqrt(hoger))) ** 3;
  return { low: Math.max(0, low), high };
}

/** Hoe hard een cijfer is, naar het aantal vellen waarop het rust. */
export function confidenceFor(used: number): DemandConfidence {
  if (used >= 30) return "measured";
  if (used >= 10) return "estimate";
  if (used >= 3) return "rough";
  return "none";
}

/* ---------- rekenen ---------- */

function dagVerschil(vanaf: Date, tot: Date) {
  return (tot.getTime() - vanaf.getTime()) / 86_400_000;
}

/** Kalenderdagen omrekenen naar werkdagen; er wordt niet in het weekend geplakt. */
function naarWerkdagen(kalenderdagen: number) {
  return (kalenderdagen / 7) * werkdagenPerWeek;
}

export function stockPlan(
  catalog: InventoryCatalogItem[],
  transactions: InventoryTransactionEntry[],
  quantities: Record<string, number>,
  now: Date,
  policy: StockPolicy = defaultStockPolicy,
): StockPlanRow[] {
  const vensterVanaf = now.getTime() - usageWindowDays * 86_400_000;
  const recentVanaf = now.getTime() - recentDays * 86_400_000;

  const verbruik = transactions.filter((entry) => {
    if (!isRealUsage(entry)) return false;
    const moment = new Date(entry.occurredAt).getTime();
    return !Number.isNaN(moment) && moment >= vensterVanaf;
  });

  /*
   * Het venster is nooit langer dan hoe lang we meten. Anders deel je het
   * verbruik van tien dagen door acht weken en lijkt alles stil te staan.
   */
  const eersteMeting = verbruik.reduce((vroegste, entry) => {
    const moment = new Date(entry.occurredAt).getTime();
    return moment < vroegste ? moment : vroegste;
  }, now.getTime());
  const gemetenDagen = Math.max(1, dagVerschil(new Date(eersteMeting), now));
  const vensterDagen = Math.min(usageWindowDays, gemetenDagen);
  // Het recente deel telt dubbel, dus het gewogen venster is navenant langer.
  const recentInVenster = Math.min(recentDays, vensterDagen);
  const gewogenDagen = vensterDagen + recentInVenster * (recentGewicht - 1);

  return catalog
    .filter((item) => item.dataQuality === "ready")
    .map((item): StockPlanRow => {
      const vanDitVel = verbruik.filter((entry) =>
        entry.catalogKey ? entry.catalogKey === item.catalogKey : entry.sku === item.sku);

      let used = 0;
      let gewogen = 0;
      let laatste = 0;
      for (const entry of vanDitVel) {
        const aantal = Math.abs(entry.quantityDelta);
        const moment = new Date(entry.occurredAt).getTime();
        used += aantal;
        gewogen += moment >= recentVanaf ? aantal * recentGewicht : aantal;
        if (moment > laatste) laatste = moment;
      }

      const stock = inventoryQuantity(quantities, item);
      const perWeek = used > 0 ? (gewogen / gewogenDagen) * 7 : null;
      const band = poissonRange(used);
      /*
       * De band door precies dezelfde molen als het puntgetal: dezelfde noemer
       * én dezelfde weging. Ging dat mis, dan lag de band naast het getal in
       * plaats van eromheen — op het scherm stond "12 per week" met een band
       * van 16 tot 37, en dan klopt er zichtbaar iets niet.
       */
      const opTempo = (aantal: number) => ((aantal * (used > 0 ? gewogen / used : 1))
        / gewogenDagen) * 7;
      const perWeekLow = used > 0 ? opTempo(band.low) : null;
      const perWeekHigh = used > 0 ? opTempo(band.high) : null;

      const perDag = perWeek === null ? null : perWeek / 7;
      /*
       * Bestelpunt en aanvulniveau met een Poisson-marge erbovenop.
       *
       * Het bestelpunt dekt de levertijd plus de ingestelde marge; het
       * aanvulniveau ook nog de tijd tot de volgende bestelronde, want je moet
       * het uithouden tot de levering ná de eerstvolgende keer kijken.
       *
       * De veiligheidsmarge is wortel(verwacht verbruik) maal 1,645. Bij tellen
       * met veel nul-dagen is de spreiding gelijk aan het gemiddelde, dus die
       * wortel is gratis — je hoeft geen standaardafwijking te schatten uit een
       * handvol weken, en dat kan ook niet. Het komt neer op ongeveer negentien
       * van de twintig keer op tijd zijn.
       *
       * Bewust NIET de bovengrens van de vraagband gebruiken. Die zegt hoe
       * onzeker ons tempo-cijfer is, en dat hoort de lezer te zien — maar hem
       * ook nog in het bestelaantal stoppen telt dezelfde onzekerheid twee keer
       * en verdubbelt de order.
       */
      const marge = (verwacht: number) => 1.645 * Math.sqrt(verwacht);
      const reorderPoint = perDag === null
        ? null
        : (() => {
          const verwacht = perDag * (policy.leadTimeDays + policy.safetyDays);
          return Math.ceil(verwacht + marge(verwacht));
        })();
      const orderUpTo = perDag === null
        ? null
        : (() => {
          const verwacht = perDag
            * (policy.leadTimeDays + policy.orderCycleDays + policy.safetyDays);
          return Math.ceil(verwacht + marge(verwacht));
        })();

      const kaal = orderUpTo === null ? 0 : Math.max(0, orderUpTo - stock);
      const suggested = metOndergrens(kaal, {
        used, perDag, stock, minimum: policy.minLineQuantity,
      });
      const workingDaysLeft = perDag === null || perDag <= 0
        ? null
        : Math.floor(naarWerkdagen(stock / perDag));
      const orderWithinDays = perDag === null || perDag <= 0 || reorderPoint === null
        ? null
        : Math.floor(naarWerkdagen((stock - reorderPoint) / perDag));

      const daysSinceUse = laatste > 0
        ? Math.floor(naarWerkdagen(dagVerschil(new Date(laatste), now)))
        : null;

      return {
        catalogKey: item.catalogKey,
        storageNumber: item.storageNumber,
        sku: item.sku,
        ownNumber: item.ownNumber,
        sharedNumber: item.sharedNumber,
        model: item.model,
        compatibleModels: item.compatibleModels,
        layout: layoutWithCountry(item.layout, item.sku),
        // Engels; de Nederlandse terugval van extractStickerVariant hoort niet
        // op het scherm van een Roemeense drukkerij.
        variant: item.sku.match(/E\d+/i)?.[0]?.toUpperCase() ?? "—",
        note: item.sourceNote ?? "",
        stock,
        used,
        daysSinceUse,
        perWeek,
        perWeekLow,
        perWeekHigh,
        confidence: confidenceFor(used),
        reorderPoint,
        orderUpTo,
        suggested,
        workingDaysLeft,
        orderWithinDays,
        status: statusVoor({ stock, used, perDag, reorderPoint, workingDaysLeft }, policy),
      };
    });
}

/**
 * De ondergrens per regel, met een rem erop.
 *
 * Alleen waar er genoeg verbruik onder zit, en alleen zolang het de hangmap
 * niet boven een dekking van drie maanden tilt. Zonder die twee voorwaarden
 * krijgt elke hangmap waar ooit één vel uit is gegaan er tien bij, en dat is
 * geen batch maar dode voorraad.
 */
function metOndergrens(
  kaal: number,
  invoer: { used: number; perDag: number | null; stock: number; minimum: number },
) {
  if (kaal <= 0 || kaal >= invoer.minimum) return kaal;
  if (invoer.used < genoegGezien || invoer.perDag === null || invoer.perDag <= 0) return kaal;
  const naLevering = invoer.stock + invoer.minimum;
  const dekking = naarWerkdagen(naLevering / invoer.perDag);
  if (dekking > maxDekkingWerkdagen) return kaal;
  return invoer.minimum;
}

function statusVoor(
  invoer: {
    stock: number;
    used: number;
    perDag: number | null;
    reorderPoint: number | null;
    workingDaysLeft: number | null;
  },
  policy: StockPolicy,
): StockStatus {
  if (invoer.stock <= 0) return "out";
  // Niets gebruikt in het hele venster. Dat is geen bestelregel maar een
  // mededeling: hier hoeft niets bijgedrukt te worden.
  if (invoer.used === 0 || invoer.perDag === null) return "idle";

  const levertijdWerkdagen = naarWerkdagen(policy.leadTimeDays);
  if (invoer.workingDaysLeft !== null && invoer.workingDaysLeft < levertijdWerkdagen) {
    // Leeg voordat een bestelling van vandaag binnen kan zijn.
    return "critical";
  }
  if (invoer.reorderPoint !== null && invoer.stock <= invoer.reorderPoint) return "order";

  const tot = naarWerkdagen(policy.leadTimeDays + policy.orderCycleDays + policy.safetyDays);
  if (invoer.workingDaysLeft !== null && invoer.workingDaysLeft < tot) return "watch";
  return "ok";
}

/* ---------- sorteren en groeperen ---------- */

const haast: Record<StockStatus, number> = {
  out: 0, critical: 1, order: 2, watch: 3, idle: 4, ok: 5,
};

/**
 * Wat besteld moet worden, met de meeste haast bovenaan.
 *
 * Een lege hangmap staat er altijd op, ook als er nooit iets uit is gehaald.
 * Er valt dan geen aantal te noemen — we weten niet hoe hard het loopt — maar
 * "leeg" is een feit dat de leverancier hoort te zien. Hem stilzwijgend
 * weglaten omdat we geen getal hebben, is precies hoe je een gat overslaat.
 */
export function toOrder(rows: StockPlanRow[]) {
  return rows
    .filter((rij) => (rij.suggested > 0 || rij.stock <= 0)
      && (rij.status === "out" || rij.status === "critical" || rij.status === "order"))
    .sort((links, rechts) =>
      haast[links.status] - haast[rechts.status]
      || (links.orderWithinDays ?? 9999) - (rechts.orderWithinDays ?? 9999)
      || rechts.suggested - links.suggested);
}

/**
 * Wat er niet móét, maar wel mee kan.
 *
 * Er gaat toch een order uit. Alles wat binnen de meelifttermijn tóch aan de
 * beurt komt kan er net zo goed bij: dat scheelt een tweede drukgang voor een
 * handjevol vellen. Drie dingen blijven eruit — wat stilstaat, wat te weinig
 * gemeten is om op te plannen, en wat al genoeg heeft.
 */
export function canRideAlong(rows: StockPlanRow[], policy: StockPolicy) {
  return rows
    .filter((rij) => rij.status === "watch" || rij.status === "ok")
    .filter((rij) => rij.used >= genoegGezien
      && rij.suggested > 0
      && rij.orderWithinDays !== null
      && rij.orderWithinDays <= policy.canOrderDays)
    .sort((links, rechts) =>
      (links.orderWithinDays ?? 9999) - (rechts.orderWithinDays ?? 9999)
      || rechts.suggested - links.suggested);
}

/**
 * De hardlopers, met hun aandeel in het totaal.
 *
 * Niet als ranglijst maar als opbouw: "deze twaalf zijn samen tachtig procent
 * van alles wat er doorheen gaat". Een positie in die opbouw zegt iets; plek
 * zevenendertig op een lijst niet.
 */
export type MoverRow = StockPlanRow & {
  /** Aandeel van dit vel in het totale verbruik, als fractie. */
  share: number;
  /** Aandeel van dit vel en alles erboven samen. */
  cumulative: number;
  /** A tot 80%, B tot 95%, C de rest. */
  klasse: "A" | "B" | "C";
};

export function fastMovers(rows: StockPlanRow[], aThreshold = 80, bThreshold = 95): MoverRow[] {
  const bewegend = rows.filter((rij) => rij.used > 0)
    .sort((links, rechts) => rechts.used - links.used || links.storageNumber - rechts.storageNumber);
  const totaal = bewegend.reduce((som, rij) => som + rij.used, 0);
  if (totaal === 0) return [];

  let opgeteld = 0;
  return bewegend.map((rij) => {
    const share = rij.used / totaal;
    /*
     * De grens ligt op wat er vóór dit vel al is opgeteld, niet op wat er ná
     * dit vel staat. Dat is dezelfde regel als calculateAbcAnalysis elders in
     * de app; met de andere lezing zou hetzelfde vel op twee schermen in twee
     * klassen kunnen vallen.
     */
    const voor = opgeteld * 100;
    opgeteld += share;
    return {
      ...rij,
      share,
      cumulative: opgeteld,
      klasse: voor < aThreshold ? "A" : voor < bThreshold ? "B" : "C",
    };
  });
}

/** Wat stilstaat: voorraad zonder verbruik, het meeste vastgehouden bovenaan. */
export function idleRows(rows: StockPlanRow[]) {
  return rows
    .filter((rij) => rij.used === 0)
    .sort((links, rechts) => rechts.stock - links.stock || links.storageNumber - rechts.storageNumber);
}

/** Alles, hardst lopend bovenaan; wat stilstaat zakt vanzelf naar onderen. */
export function byMovement(rows: StockPlanRow[]) {
  return [...rows].sort((links, rechts) =>
    rechts.used - links.used
    || links.stock - rechts.stock
    || links.storageNumber - rechts.storageNumber);
}

export function searchRows(rows: StockPlanRow[], query: string) {
  const gezocht = query.trim().toLowerCase();
  if (!gezocht) return rows;
  return rows.filter((rij) =>
    rij.sku.toLowerCase().includes(gezocht)
    || rij.model.toLowerCase().includes(gezocht)
    || rij.layout.toLowerCase().includes(gezocht)
    || String(rij.storageNumber) === gezocht);
}

/* ---------- de samenvatting boven het scherm ---------- */

export type StockSummary = {
  /** Hoeveel hangmappen in elke toestand. */
  out: number;
  critical: number;
  order: number;
  watch: number;
  ok: number;
  idle: number;
  /** Hoeveel vellen er in totaal besteld zouden moeten worden. */
  sheetsToOrder: number;
  /** Hoeveel regels dat zijn. */
  linesToOrder: number;
  /** Over hoeveel werkdagen de eerste regel te laat is; null als er geen haast is. */
  soonestOrderWithinDays: number | null;
  /** Vellen die stilstaan. */
  idleSheets: number;
  /** Hoeveel dagen er is gemeten. */
  measuredDays: number;
  /**
   * Telt de dubbele weging van de laatste twee weken nu echt mee?
   *
   * Zolang de hele meetperiode binnen die twee weken valt, krijgt élke boeking
   * hetzelfde gewicht en verandert er niets. Dan hoort het scherm dat ook niet
   * te beweren.
   */
  recencyWeightingApplies: boolean;
  /** Totaal verbruik in het venster. */
  usedInWindow: number;
};

export function stockSummary(rows: StockPlanRow[], measuredDays: number): StockSummary {
  const bestellen = toOrder(rows);
  const tel = (status: StockStatus) => rows.filter((rij) => rij.status === status).length;
  const eerst = bestellen
    .map((rij) => rij.orderWithinDays)
    .filter((dagen): dagen is number => dagen !== null)
    .sort((links, rechts) => links - rechts)[0];

  return {
    out: tel("out"),
    critical: tel("critical"),
    order: tel("order"),
    watch: tel("watch"),
    ok: tel("ok"),
    idle: tel("idle"),
    sheetsToOrder: bestellen.reduce((som, rij) => som + rij.suggested, 0),
    linesToOrder: bestellen.length,
    soonestOrderWithinDays: eerst ?? null,
    idleSheets: rows.filter((rij) => rij.used === 0).reduce((som, rij) => som + rij.stock, 0),
    measuredDays: Math.round(measuredDays),
    recencyWeightingApplies: measuredDays > recentDays,
    usedInWindow: rows.reduce((som, rij) => som + rij.used, 0),
  };
}

/** Hoeveel dagen er is gemeten; de kop moet dat noemen. */
export function measuredDays(transactions: InventoryTransactionEntry[], now: Date) {
  const momenten = transactions
    .filter(isRealUsage)
    .map((entry) => new Date(entry.occurredAt).getTime())
    .filter((moment) => !Number.isNaN(moment));
  if (momenten.length === 0) return 0;
  return dagVerschil(new Date(Math.min(...momenten)), now);
}

/* ---------- zelf sorteren ---------- */

export type SortDirection = "asc" | "desc";
/** Null betekent: de standaardvolgorde van dat tabblad. */
export type SortState = { key: string; direction: SortDirection } | null;

/**
 * Klikken op een kolomkop.
 *
 * Drie standen en niet twee: oplopend, aflopend, en terug naar de volgorde die
 * het tabblad zelf bedoelt. Zonder die derde stand kun je "meeste haast
 * bovenaan" nooit meer terugkrijgen zonder de pagina te herladen.
 */
export function nextSort(huidig: SortState, key: string): SortState {
  if (!huidig || huidig.key !== key) return { key, direction: "asc" };
  if (huidig.direction === "asc") return { key, direction: "desc" };
  return null;
}

/**
 * Sorteren op één kolom, met lege waarden altijd onderaan.
 *
 * Een hangmap zonder verbruikscijfer heeft geen tempo. Die bovenaan zetten
 * omdat "niets" lager is dan nul maakt van elke sortering een lijst met
 * streepjes bovenin, en dan zie je juist niet waar het om gaat.
 */
export function sortRows<T>(
  rows: T[],
  direction: SortDirection,
  waarde: (rij: T) => string | number | null,
): T[] {
  const teken = direction === "asc" ? 1 : -1;
  return [...rows].sort((links, rechts) => {
    const a = waarde(links);
    const b = waarde(rechts);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (typeof a === "number" && typeof b === "number") return (a - b) * teken;
    return String(a).localeCompare(String(b), "nl") * teken;
  });
}
