"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-catalog";
import { downloadTekstbestand } from "@/lib/bestand-downloaden";
import type { InventoryTransactionEntry } from "@/domain/operations";
import {
  byMovement,
  fastMovers,
  idleRows,
  measuredDays,
  searchRows,
  stockPlan,
  stockSummary,
  toOrder,
  nextSort,
  sortRows,
  usageWindowDays,
  type MoverRow,
  type SortState,
  type StockPlanRow,
  type StockPolicy,
} from "@/domain/stock-plan";
import {
  confidenceLabel,
  statusLabel,
  statusUitleg,
  woorden,
  type Taal,
  type Woorden,
} from "@/domain/stock-plan-labels";
import { createOrderCsv, createSheetListCsv } from "@/domain/stock-plan-export";
import { displayStickerSku } from "@/domain/sticker-sku";

/**
 * Het voorraadscherm, voor Noviply én voor management.
 *
 * Er stonden twee tabellen met getallen zonder gevolg: verbruik per week,
 * voorraad, en een streepje waar het minimum hoorde. Een leverancier kan daar
 * niets mee — hij wil weten wat opraakt, hoeveel hij moet sturen en wanneer het
 * weg moet. Dat is nu het eerste tabblad; al het andere staat erachter.
 *
 * Eén component voor beide rollen, met alleen de woorden gesplitst. Twee
 * schermen die hetzelfde beweren maar los rekenen, gaan vroeg of laat ruzie
 * maken over cijfers.
 */

type Tab = "order" | "fast" | "slow" | "all";

type Props = {
  taal: Taal;
  transactions: InventoryTransactionEntry[];
  quantities: Record<string, number>;
  policy: StockPolicy;
  /** Drempels voor de A/B/C-indeling; management stelt die in. */
  abcA?: number;
  abcB?: number;
};

function getal(waarde: number | null, cijfers = 0) {
  if (waarde === null) return "—";
  return waarde.toLocaleString("nl-NL", { maximumFractionDigits: cijfers });
}

/**
 * Het tempo met zijn band.
 *
 * Nooit een decimaal: van vijf geziene vellen loopt het echte tempo ergens
 * tussen twee en twaalf per week, en "3,9" doet alsof we dat weten.
 */
function tempo(rij: StockPlanRow) {
  if (rij.perWeek === null) return <span className="plan-leeg">—</span>;
  const laag = Math.round(rij.perWeekLow ?? 0);
  const hoog = Math.round(rij.perWeekHigh ?? 0);
  return (
    <span className="plan-tempo">
      <b>{Math.round(rij.perWeek)}</b>
      <small>{laag}–{hoog}</small>
    </span>
  );
}

/** Werkdagen, of "te laat" met hoeveel. */
function termijn(dagen: number | null, w: Woorden) {
  if (dagen === null) return <span className="plan-leeg">—</span>;
  if (dagen < 0) {
    return <span className="plan-telaat">{Math.abs(dagen)} {w.workingDays} {w.overdue}</span>;
  }
  if (dagen === 0) return <span className="plan-telaat">{w.today}</span>;
  return <span className={dagen <= 5 ? "plan-kort" : ""}>{dagen} {w.workingDays}</span>;
}

function nummerCel(rij: StockPlanRow, w: Woorden) {
  return (
    <>
      {displayStickerSku(rij.sku)}
      {rij.ownNumber && <span className="plan-eigen">{w.ownNumber}</span>}
      {rij.sharedNumber && <span className="plan-gedeeld">{w.shared}</span>}
    </>
  );
}

/**
 * Een kolomkop waarop je kunt klikken.
 *
 * De pijl staat er alleen als er op deze kolom wordt gesorteerd; een tabel vol
 * pijltjes zegt niets. Drie klikken brengt je terug bij de volgorde die het
 * tabblad zelf bedoelt.
 */
function Kop({
  label, sleutel, stand, opKlik, uitleg,
}: {
  label: string;
  /** Leeg betekent: hier valt niet zinnig op te sorteren. */
  sleutel?: string;
  stand: SortState;
  opKlik: (sleutel: string) => void;
  uitleg: string;
}) {
  if (!sleutel) return <th>{label}</th>;
  const actief = stand?.key === sleutel;
  const richting = actief ? stand?.direction : undefined;
  return (
    <th
      aria-sort={richting === "asc" ? "ascending" : richting === "desc" ? "descending" : "none"}
    >
      <button type="button" className={`kolom-knop${actief ? " is-actief" : ""}`}
        onClick={() => opKlik(sleutel)} title={uitleg}>
        {label}
        <span aria-hidden="true">{richting === "asc" ? "▲" : richting === "desc" ? "▼" : "↕"}</span>
      </button>
    </th>
  );
}

export function StockPlanner({
  taal, transactions, quantities, policy, abcA = 80, abcB = 95,
}: Props) {
  const [tab, setTab] = useState<Tab>("order");
  const [query, setQuery] = useState("");
  const [bericht, setBericht] = useState("");
  /*
   * Zelf sorteren, per tabblad apart. Wie op "Bestellen" op voorraad heeft
   * gesorteerd bedoelt daar niet mee dat de hardlopers ook zo moeten staan.
   */
  const [sortering, setSortering] = useState<Record<Tab, SortState>>({
    order: null, fast: null, slow: null, all: null,
  });
  const w = woorden[taal];

  const nu = useMemo(() => new Date(), []);

  const rijen = useMemo(
    () => stockPlan(inventoryCatalog, transactions, quantities, nu, policy),
    [transactions, quantities, nu, policy],
  );
  const gemeten = useMemo(() => measuredDays(transactions, nu), [transactions, nu]);
  const samen = useMemo(() => stockSummary(rijen, gemeten), [rijen, gemeten]);
  const bestellen = useMemo(() => toOrder(rijen), [rijen]);
  const hardlopers = useMemo(() => fastMovers(rijen, abcA, abcB), [rijen, abcA, abcB]);
  const stilstaand = useMemo(() => idleRows(rijen), [rijen]);
  const alles = useMemo(() => searchRows(byMovement(rijen), query), [rijen, query]);

  /*
   * Waarop een kolom sorteert. Bewust op de onderliggende waarde en niet op wat
   * er in de cel staat: "20 werkdagen te laat" hoort vóór "2 werkdagen over",
   * en dat lukt alleen met het getal erachter.
   */
  const kolomwaarde = (rij: StockPlanRow, sleutel: string): string | number | null => {
    switch (sleutel) {
      case "folder": return rij.storageNumber;
      case "sku": return rij.sku;
      case "layout": return rij.layout;
      case "variant": return rij.variant;
      case "fits": return rij.compatibleModels;
      case "stock": return rij.stock;
      case "used": return rij.used;
      case "perWeek": return rij.perWeek;
      case "reorderPoint": return rij.reorderPoint;
      case "daysLeft": return rij.workingDaysLeft;
      case "orderBy": return rij.orderWithinDays;
      case "suggested": return rij.suggested;
      case "note": return rij.note;
      case "status": return statusLabel[taal][rij.status];
      case "klasse": return (rij as MoverRow).klasse ?? null;
      case "share": return rij.used;
      default: return null;
    }
  };

  /** De lijst zoals het tabblad hem bedoelt, of zoals er geklikt is. */
  function gesorteerd<T extends StockPlanRow>(lijst: T[], voor: Tab): T[] {
    const stand = sortering[voor];
    if (!stand) return lijst;
    return sortRows(lijst, stand.direction, (rij) => kolomwaarde(rij, stand.key));
  }

  const sorteer = (voor: Tab) => (sleutel: string) =>
    setSortering((vorige) => ({ ...vorige, [voor]: nextSort(vorige[voor], sleutel) }));

  const sorteerUitleg = taal === "en"
    ? "Sort by this column — click again to reverse, once more for the default order"
    : "Sorteer op deze kolom — nog een klik draait om, en nog een zet hem terug";

  const levertijdWeken = Math.round((policy.leadTimeDays / 7) * 10) / 10;
  const venster = Math.min(usageWindowDays, Math.max(1, Math.round(gemeten)));

  const tabs: { id: Tab; label: string; aantal: number }[] = [
    { id: "order", label: w.orderNow, aantal: bestellen.length },
    { id: "fast", label: w.fastMovers, aantal: hardlopers.length },
    { id: "slow", label: w.slow, aantal: stilstaand.length },
    { id: "all", label: w.all, aantal: rijen.length },
  ];

  return (
    <section className="noviply-panel plan-paneel">
      {/*
        De kop staat boven de tabbladen en blijft altijd staan. Hij zegt in één
        regel waar de cijfers op rusten: hoe lang er gemeten is, hoeveel er in
        die tijd doorheen ging, en met welke levertijd wordt gerekend. Zonder
        dat weet een lezer niet hoe zwaar hij ze mag wegen.
      */}
      <div className="plan-kop">
        <div className="plan-kengetallen">
          <div className={bestellen.length > 0 ? "plan-kengetal is-actie" : "plan-kengetal"}>
            <strong>{samen.linesToOrder}</strong>
            <span>{taal === "en" ? "to order" : "te bestellen"}</span>
            <small>{samen.sheetsToOrder} {w.sheets}</small>
          </div>
          <div className={samen.out + samen.critical > 0 ? "plan-kengetal is-erg" : "plan-kengetal"}>
            <strong>{samen.out + samen.critical}</strong>
            <span>{taal === "en" ? "empty or critical" : "leeg of kritiek"}</span>
            <small>
              {samen.out} {taal === "en" ? "empty" : "leeg"} · {samen.critical}{" "}
              {taal === "en" ? "critical" : "kritiek"}
            </small>
          </div>
          <div className="plan-kengetal">
            <strong>{hardlopers.filter((rij) => rij.klasse === "A").length}</strong>
            <span>{taal === "en" ? "carry most of the work" : "dragen het meeste werk"}</span>
            <small>
              {taal === "en" ? `of ${hardlopers.length} moving` : `van ${hardlopers.length} bewegend`}
            </small>
          </div>
          <div className="plan-kengetal">
            <strong>{stilstaand.length}</strong>
            <span>{taal === "en" ? "not moving" : "staan stil"}</span>
            <small>{samen.idleSheets} {w.sheets}</small>
          </div>
        </div>
        {/* Waar de cijfers op rusten, en met welke levertijd er is gerekend.
            Dat laatste is geen meting maar wat Noviply zelf opgeeft; management
            stelt het bij zodra de eerste leveringen zijn doorgemeten. */}
        <p className="plan-basis">
          {taal === "en"
            ? `Measured over ${venster} days · ${samen.usedInWindow} sheets used · lead time ${levertijdWeken} weeks (${policy.leadTimeDays} days, as Noviply gives it) · assumes ordering every ${policy.reviewDays} days.`
            : `Gemeten over ${venster} dagen · ${samen.usedInWindow} vellen gebruikt · levertijd ${levertijdWeken} weken (${policy.leadTimeDays} dagen, zoals Noviply hem opgeeft — aan te passen bij Instellingen) · gaat uit van elke ${policy.reviewDays} dagen bestellen.`}
          {/* Alleen zeggen dat de recente weging meetelt als hij dat ook doet.
              Valt de hele meetperiode binnen die twee weken, dan krijgt elke
              boeking hetzelfde gewicht en verandert er niets. */}
          {samen.recencyWeightingApplies && (taal === "en"
            ? " The last two weeks count double, because the share of work going through sheets is still rising."
            : " De laatste twee weken tellen dubbel, omdat het aandeel werk dat via een vel gaat nog stijgt.")}
        </p>
      </div>

      <div className="plan-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            <b>{item.aantal}</b>
          </button>
        ))}
      </div>

      {tab === "order" && (
        <div className="plan-inhoud">
          <div className="plan-inhoud-kop">
            <p>
              {taal === "en"
                ? "Everything that will run out before a replacement can arrive, most urgent first. “Order at” is the level where a new batch has to be on its way; “top up to” is where it should be after delivery."
                : "Alles wat opraakt voordat er iets nieuws binnen kan zijn, met de meeste haast bovenaan. “Bestelpunt” is de stand waarop er iets onderweg moet zijn; “aanvullen tot” is waar het na levering hoort te staan."}
            </p>
            {bestellen.length > 0 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  downloadTekstbestand(
                    createOrderCsv(bestellen, taal),
                    `rekey-order-${new Date().toISOString().slice(0, 10)}.csv`,
                  );
                  setBericht(`${bestellen.length} ${w.lines}.`);
                }}
              >
                {w.download}
              </button>
            )}
          </div>
          {bestellen.length === 0 ? (
            <div className="empty">{w.nothing}</div>
          ) : (
            <div className="table-wrap">
              <table className="operations-table">
                <thead>
                  <tr>
                    {[
                      ["folder", w.folder], ["sku", w.partNumber], ["layout", w.layout],
                      ["stock", w.inStock], ["perWeek", w.perWeek], ["reorderPoint", w.reorderAt],
                      ["daysLeft", w.daysLeft], ["orderBy", w.orderBy], ["suggested", w.send],
                      ["status", w.status],
                    ].map(([sleutel, label]) => (
                      <Kop key={sleutel} label={label} sleutel={sleutel}
                        stand={sortering.order} opKlik={sorteer("order")} uitleg={sorteerUitleg} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gesorteerd(bestellen, "order").map((rij) => (
                    <tr key={rij.catalogKey} className={`plan-rij is-${rij.status}`}>
                      <td data-label={w.folder}>
                        <strong className="storage-number">No. {rij.storageNumber}</strong>
                        <span>{rij.model}</span>
                      </td>
                      <td data-label={w.partNumber}>{nummerCel(rij, w)}</td>
                      <td data-label={w.layout}>{rij.layout}</td>
                      <td data-label={w.inStock}>
                        <b className={rij.stock === 0 ? "zero" : ""}>{rij.stock}</b>
                      </td>
                      <td data-label={w.perWeek}>
                        {tempo(rij)}
                        {/* Hoe hard dit cijfer is, juist hier: op deze lijst
                            worden aantallen besteld. Bij één of twee geziene
                            vellen valt er geen tempo af te leiden, en dan hoort
                            dat naast het getal te staan. */}
                        <small className={`plan-zeker is-${rij.confidence}`}>
                          {confidenceLabel[taal][rij.confidence]}
                        </small>
                      </td>
                      <td data-label={w.reorderAt}>{getal(rij.reorderPoint)}</td>
                      <td data-label={w.daysLeft}>{termijn(rij.workingDaysLeft, w)}</td>
                      <td data-label={w.orderBy}>{termijn(rij.orderWithinDays, w)}</td>
                      <td data-label={w.send}>
                        {rij.suggested > 0
                          ? (
                            <b className={`plan-aantal${rij.confidence === "none" ? " is-zacht" : ""}`}
                              title={rij.confidence === "none"
                                ? (taal === "en"
                                  ? `Based on ${rij.used} sheet${rij.used === 1 ? "" : "s"} seen — treat as a starting point, not a figure.`
                                  : `Gebaseerd op ${rij.used} gezien vel${rij.used === 1 ? "" : "len"} — een beginpunt, geen cijfer.`)
                                : undefined}
                            >
                              {rij.confidence === "none" ? "±" : ""}{rij.suggested}
                            </b>
                          )
                          : <span className="plan-leeg" title={taal === "en"
                            ? "Empty, but never used in the measured period — tell us what you think is right."
                            : "Leeg, maar nooit gebruikt in de meetperiode — hier valt geen aantal op te baseren."}>?</span>}
                      </td>
                      <td data-label={w.status}>
                        <span className={`plan-stand is-${rij.status}`} title={statusUitleg[taal][rij.status]}>
                          {statusLabel[taal][rij.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "fast" && (
        <div className="plan-inhoud">
          <div className="plan-inhoud-kop">
            <p>
              {/* Geen ranglijst maar een opbouw. Plek zevenendertig zegt niets;
                  "deze dertien zijn samen tachtig procent" wel. */}
              {taal === "en"
                ? `The sheets that carry the work, as a build-up rather than a ranking. Class A together make up the first ${abcA}% of everything used, B up to ${abcB}%. Print capacity belongs with A.`
                : `De vellen die het werk dragen, als opbouw en niet als ranglijst. Klasse A vormt samen de eerste ${abcA}% van alles wat er doorheen ging, B tot ${abcB}%. Printcapaciteit hoort bij A.`}
            </p>
          </div>
          {hardlopers.length === 0 ? (
            <div className="empty">
              {taal === "en" ? "Nothing used yet." : "Nog niets gebruikt."}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="operations-table">
                <thead>
                  <tr>
                    {[
                      ["klasse", w.klasse], ["folder", w.folder], ["sku", w.partNumber],
                      ["layout", w.layout], ["used", w.used], ["share", w.share],
                      ["", w.running], ["perWeek", w.perWeek], ["stock", w.inStock],
                      ["fits", w.fits], ["status", w.status],
                    ].map(([sleutel, label], index) => (
                      <Kop key={sleutel || `kop-${index}`} label={label} sleutel={sleutel || undefined}
                        stand={sortering.fast} opKlik={sorteer("fast")} uitleg={sorteerUitleg} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gesorteerd(hardlopers, "fast").map((rij) => (
                    <tr key={rij.catalogKey}>
                      <td data-label={w.klasse}>
                        <span className={`plan-klasse is-${rij.klasse.toLowerCase()}`}>{rij.klasse}</span>
                      </td>
                      <td data-label={w.folder}>
                        <strong className="storage-number">No. {rij.storageNumber}</strong>
                        <span>{rij.model}</span>
                      </td>
                      <td data-label={w.partNumber}>{nummerCel(rij, w)}</td>
                      <td data-label={w.layout}>{rij.layout}</td>
                      <td data-label={w.used}><b className="mover-used">{rij.used}×</b></td>
                      <td data-label={w.share}>{Math.round(rij.share * 100)}%</td>
                      <td data-label={w.running}>
                        {/* De opbouw als balkje: waar loopt de tachtig-procentstreep? */}
                        <span className="plan-balk" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, rij.cumulative * 100)}%` }} />
                        </span>
                        <small>{Math.round(rij.cumulative * 100)}%</small>
                      </td>
                      <td data-label={w.perWeek}>
                        {tempo(rij)}
                        <small className={`plan-zeker is-${rij.confidence}`}>
                          {confidenceLabel[taal][rij.confidence]}
                        </small>
                      </td>
                      <td data-label={w.inStock}>
                        <b className={rij.stock === 0 ? "zero" : ""}>{rij.stock}</b>
                      </td>
                      <td data-label={w.fits} title={`${rij.compatibleModels} ${taal === "en" ? "laptop models" : "laptopmodellen"}`}>
                        {rij.compatibleModels}
                      </td>
                      <td data-label={w.status}>
                        <span className={`plan-stand is-${rij.status}`} title={statusUitleg[taal][rij.status]}>
                          {statusLabel[taal][rij.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "slow" && (
        <div className="plan-inhoud">
          <div className="plan-inhoud-kop">
            <p>
              {taal === "en"
                ? `Nothing came out of these in the measured period — together ${samen.idleSheets} sheets. This is the other half of the answer: do not reprint these. The number of weeks of cover is left out on purpose; with zero use it is a meaningless figure.`
                : `Hier is in de meetperiode niets uit gegaan — samen ${samen.idleSheets} vellen. Dit is de andere helft van het antwoord: hier hoeft niets bijgedrukt te worden. De dekking in weken staat er bewust niet bij; zonder verbruik is dat een nietszeggend getal.`}
            </p>
          </div>
          <div className="table-wrap">
            <table className="operations-table">
              <thead>
                <tr>
                  {[
                    ["folder", w.folder], ["sku", w.partNumber], ["layout", w.layout],
                    ["variant", w.enter], ["stock", w.inStock], ["fits", w.fits], ["note", w.note],
                  ].map(([sleutel, label]) => (
                    <Kop key={sleutel} label={label} sleutel={sleutel}
                      stand={sortering.slow} opKlik={sorteer("slow")} uitleg={sorteerUitleg} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {gesorteerd(stilstaand, "slow").map((rij) => (
                  <tr key={rij.catalogKey}>
                    <td data-label={w.folder}>
                      <strong className="storage-number">No. {rij.storageNumber}</strong>
                      <span>{rij.model}</span>
                    </td>
                    <td data-label={w.partNumber}>{nummerCel(rij, w)}</td>
                    <td data-label={w.layout}>{rij.layout}</td>
                    <td data-label={w.enter}>{rij.variant}</td>
                    <td data-label={w.inStock}>
                      <b className={rij.stock === 0 ? "zero" : ""}>{rij.stock}</b>
                    </td>
                    <td data-label={w.fits}>{rij.compatibleModels}</td>
                    <td data-label={w.note}><small>{rij.note}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "all" && (
        <div className="plan-inhoud">
          <div className="plan-inhoud-kop">
            <p>
              {taal === "en"
                ? "Every sheet we hold, fastest moving first. Search by part number, model or folder."
                : "Elk vel dat we hebben, hardst lopend bovenaan. Zoek op artikelnummer, model of hangmap."}
            </p>
            <div className="noviply-panel-acties">
              <input
                className="zoekveld"
                value={query}
                placeholder={w.search}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  downloadTekstbestand(
                    createSheetListCsv(alles, taal),
                    `rekey-sheets-${new Date().toISOString().slice(0, 10)}.csv`,
                  );
                  setBericht(`${alles.length} ${w.lines}.`);
                }}
              >
                {w.download}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="operations-table">
              <thead>
                <tr>
                  {[
                    ["folder", w.folder], ["sku", w.partNumber], ["layout", w.layout],
                    ["variant", w.enter], ["fits", w.fits], ["used", w.used],
                    ["perWeek", w.perWeek], ["stock", w.inStock], ["daysLeft", w.daysLeft],
                    ["status", w.status],
                  ].map(([sleutel, label]) => (
                    <Kop key={sleutel} label={label} sleutel={sleutel}
                      stand={sortering.all} opKlik={sorteer("all")} uitleg={sorteerUitleg} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {gesorteerd(alles, "all").map((rij) => (
                  <tr key={rij.catalogKey}>
                    <td data-label={w.folder}>
                      <strong className="storage-number">No. {rij.storageNumber}</strong>
                      <span>{rij.model}</span>
                    </td>
                    <td data-label={w.partNumber}>{nummerCel(rij, w)}</td>
                    <td data-label={w.layout}>{rij.layout}</td>
                    <td data-label={w.enter}>{rij.variant}</td>
                    <td data-label={w.fits}>{rij.compatibleModels}</td>
                    <td data-label={w.used}><b className="mover-used">{rij.used}×</b></td>
                    <td data-label={w.perWeek}>{tempo(rij)}</td>
                    <td data-label={w.inStock}>
                      <b className={rij.stock === 0 ? "zero" : ""}>{rij.stock}</b>
                    </td>
                    <td data-label={w.daysLeft}>{termijn(rij.workingDaysLeft, w)}</td>
                    <td data-label={w.status}>
                      <span className={`plan-stand is-${rij.status}`} title={statusUitleg[taal][rij.status]}>
                        {statusLabel[taal][rij.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {alles.length === 0 && (
              <div className="empty">{w.noMatch} “{query}”.</div>
            )}
          </div>
        </div>
      )}

      {bericht && <div className="policy-saved" role="status">{bericht}</div>}
    </section>
  );
}
