"use client";

import { useMemo, useState } from "react";
import {
  inventoryCatalog,
  planningCatalog,
} from "@/data/inventory-catalog";
import { conversionMethods } from "@/domain/conversion-policy";
import type { ConversionLogEntry } from "@/domain/conversion-log";
import { calculateForecastAdvice } from "@/domain/forecasting";
import { scandinavianLayoutReferences } from "@/domain/keyboard-layouts";
import {
  buildModelGroupAudit,
  type ModelGroupStatus,
} from "@/domain/model-groups";
import {
  layoutWithCountry,
  type InventoryTransactionEntry,
  type OperationalMethodId,
} from "@/domain/operations";
import {
  bucketConversionDays,
  consumptionTrend,
  conversionTotals,
  conversionsPerDay,
  dayKey,
  getReportPeriod,
  historyDepthDays,
  importedBaselineUnits,
  methodShares,
  moverRanking,
  reportPeriods,
  type ConversionBucket,
  type ReportPeriodId,
} from "@/domain/reporting";
import { displayStickerSku } from "@/domain/sticker-sku";

/** Van eenvoudig naar zwaar, dezelfde volgorde als overal in de app. */
const methodsInTierOrder: OperationalMethodId[] = [
  "loose_stickers",
  "noviply_sheet",
  "printed_sticker",
  "direct_reprint",
];

const plannedItems = planningCatalog
  .map((item) => ({
    ...item,
    advice: calculateForecastAdvice({
      onHand: item.stock,
      reserved: item.reserved,
      averageWeeklyDemand: item.averageWeeklyDemand,
      leadTimeDays: item.leadTimeDays,
      safetyStockWeeks: item.safetyStockWeeks,
    }),
  }))
  .filter(({ advice }) => advice.recommendedOrderQuantity > 0)
  .sort((a, b) => b.advice.recommendedOrderQuantity - a.advice.recommendedOrderQuantity);

export function OrdersWorkspace() {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(plannedItems.map((item) => [item.sku, item.advice.recommendedOrderQuantity])),
  );
  const [selected, setSelected] = useState(() => new Set(plannedItems.map(({ sku }) => sku)));
  const [orderStatus, setOrderStatus] = useState<"advice" | "draft" | "approved">("advice");

  const selectedItems = plannedItems.filter(({ sku }) => selected.has(sku));
  const totalQuantity = selectedItems.reduce((sum, item) => sum + (quantities[item.sku] ?? 0), 0);
  const totalValue = selectedItems.reduce((sum, item) => sum + (quantities[item.sku] ?? 0) * item.unitCost, 0);

  function toggle(sku: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
    setOrderStatus("advice");
  }

  if (plannedItems.length === 0) {
    return (
      <div className="workspace-view">
        <section className="panel report-empty">
          <h2>Nog geen besteladvies</h2>
          <p>
            Een besteladvies rekent met gemeten verbruik, levertijd en veiligheidsvoorraad.
            Zodra er conversies geboekt zijn, weet ReKey hoe hard elke hangmap loopt en
            komt hier een concept te staan dat ergens op berust.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Bestelregels</span><strong>{selectedItems.length}</strong><small>geselecteerd voor Noviply</small></article>
        <article><span>Adviesaantal</span><strong>{totalQuantity}</strong><small>voor circa 4 weken dekking</small></article>
        <article><span>Inkoopwaarde</span><strong>€ {totalValue.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}</strong><small>exclusief transport</small></article>
        <article className={orderStatus === "approved" ? "success" : ""}><span>Werkstatus</span><strong>{orderStatus === "advice" ? "Advies" : orderStatus === "draft" ? "Concept" : "Goedgekeurd"}</strong><small>Geen bestelling extern verstuurd</small></article>
      </section>

      <section className="panel order-panel">
        <div className="order-heading">
          <div><span className="workspace-kicker">AUTOMATISCH BESTELADVIES</span><h2>Conceptbestelling Noviply</h2><p>Gebaseerd op verbruik, levertijd, reserveringen en veiligheidsvoorraad.</p></div>
          <div className="order-actions">
            <button className="secondary-button" onClick={() => setOrderStatus("draft")}>Concept opslaan</button>
            <button className="primary-button" disabled={selectedItems.length === 0} onClick={() => setOrderStatus("approved")}>Intern goedkeuren</button>
          </div>
        </div>
        {orderStatus === "approved" && (
          <div className="order-notice success"><strong>Intern goedgekeurd</strong><span>De externe verzending blijft bewust geblokkeerd totdat leverancierskoppeling en rollen actief zijn.</span></div>
        )}
        <div className="table-wrap">
          <table className="order-table">
            <thead><tr><th><span className="sr-only">Selectie</span></th><th>Artikel</th><th>Huidig</th><th>Verbruik</th><th>Bestelpunt</th><th>Advies</th><th>Bestellen</th><th>Waarde</th></tr></thead>
            <tbody>
              {plannedItems.map((item) => {
                const quantity = quantities[item.sku] ?? 0;
                return (
                  <tr key={item.sku} className={selected.has(item.sku) ? "" : "not-selected"}>
                    <td><input type="checkbox" checked={selected.has(item.sku)} onChange={() => toggle(item.sku)} aria-label={`${item.sku} selecteren`} /></td>
                    <td><strong>{item.model}</strong><span>{item.sku} · {item.layout}</span></td>
                    <td><b>{item.stock}</b><span>{item.reserved} gereserveerd</span></td>
                    <td><strong>{item.averageWeeklyDemand}/wk</strong><span>{item.leadTimeDays} dagen LT</span></td>
                    <td><strong>{item.advice.reorderPoint}</strong><span>veilig {item.advice.safetyStock}</span></td>
                    <td><strong>+{item.advice.recommendedOrderQuantity}</strong><span>doel {item.advice.targetStock}</span></td>
                    <td><input className="order-quantity" type="number" min="0" max="10000" value={quantity} onChange={(event) => { setQuantities((current) => ({ ...current, [item.sku]: Math.max(0, Number(event.target.value)) })); setOrderStatus("advice"); }} /></td>
                    <td><strong>€ {(quantity * item.unitCost).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="order-total"><span>{selectedItems.length} regels · {totalQuantity} vellen</span><strong>Totaal € {totalValue.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></footer>
      </section>
    </div>
  );
}

/** Nederlandse notatie: een komma, en geen nul achter een rond getal. */
function formatNumber(value: number) {
  return value.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

function formatDelta(delta: number, percentage: number | null) {
  const sign = delta > 0 ? "+" : "";
  if (percentage === null) return `${sign}${delta} t.o.v. vorige periode`;
  return `${sign}${delta} (${sign}${percentage.toFixed(0)}%) t.o.v. vorige periode`;
}

function formatDayLabel(bucket: ConversionBucket) {
  const short = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);
  return bucket.dayCount === 1 ? short(bucket.startDay) : `${short(bucket.startDay)}–${short(bucket.endDay)}`;
}

type ReportsProps = {
  conversionLog: ConversionLogEntry[];
  transactions: InventoryTransactionEntry[];
  quantities: Record<string, number>;
};

export function ReportsWorkspace({ conversionLog, transactions, quantities }: ReportsProps) {
  const [periodId, setPeriodId] = useState<ReportPeriodId>("month");
  const period = getReportPeriod(periodId);
  // Eén peildatum voor het hele scherm, zodat elk blok over dezelfde dag praat.
  const today = useMemo(() => dayKey(new Date()), []);

  const totals = useMemo(
    () => conversionTotals(conversionLog, period.days, today),
    [conversionLog, period.days, today],
  );
  const shares = useMemo(
    () => methodShares(conversionLog, period.days, today),
    [conversionLog, period.days, today],
  );
  const buckets = useMemo(
    () => bucketConversionDays(conversionsPerDay(conversionLog, period.days, today), 31),
    [conversionLog, period.days, today],
  );
  const trend = useMemo(
    () => consumptionTrend(transactions, period.days, today),
    [period.days, today, transactions],
  );
  const movers = useMemo(
    () => moverRanking(transactions, inventoryCatalog, quantities, period.days, today),
    [period.days, quantities, today, transactions],
  );

  const activeMovers = movers.filter((row) => row.used > 0);
  const idleWithStock = movers.filter((row) => row.used === 0 && row.stock > 0);
  const baseline = importedBaselineUnits(transactions);
  const depth = historyDepthDays(conversionLog, today);
  const tallest = Math.max(1, ...buckets.map((bucket) => bucket.total));
  // Achtentwintig datums naast elkaar lopen in elkaar over; hooguit tien passen.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 10));
  const hasConversions = conversionLog.length > 0;

  return (
    <div className="workspace-view">
      <div className="report-period" role="group" aria-label="Periode kiezen">
        {reportPeriods.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === periodId ? "active" : ""}
            aria-pressed={option.id === periodId}
            onClick={() => setPeriodId(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="workspace-stats">
        <article>
          <span>Conversies</span>
          <strong>{totals.current}</strong>
          <small>{formatDelta(totals.delta, totals.deltaPercentage)}</small>
        </article>
        <article>
          <span>Per werkdag</span>
          <strong>{totals.perActiveDay === 0 ? "—" : formatNumber(totals.perActiveDay)}</strong>
          <small>{totals.activeDays} {totals.activeDays === 1 ? "dag" : "dagen"} gewerkt in deze periode</small>
        </article>
        <article>
          <span>Vellen verbruikt</span>
          <strong>{trend.current}</strong>
          <small>{formatDelta(trend.delta, trend.deltaPercentage)}</small>
        </article>
        <article className={totals.awaitingPrint > 0 ? "attention" : ""}>
          <span>Wacht op Noviply</span>
          <strong>{totals.awaitingPrint}</strong>
          <small>aangevraagd, nog niet geprint</small>
        </article>
      </section>

      {!hasConversions && (
        <section className="panel report-empty">
          <h2>Nog geen conversies geregistreerd</h2>
          <p>
            Dit scherm vult zich zodra medewerkers conversies afronden. Elke afgeronde
            laptop telt hier mee, ook wanneer er geen voorraadvel aan te pas kwam.
          </p>
          {baseline > 0 && (
            <p className="report-note">
              De import bracht {baseline} vellen verbruik mee als beginstand. Die staat op
              één datum geboekt en telt daarom niet mee in het dagverloop — anders zou hier
              een piek staan die nooit heeft plaatsgevonden.
            </p>
          )}
        </section>
      )}

      {hasConversions && (
        <div className="report-grid">
          <section className="panel report-card usage-chart">
            <div className="workspace-card-heading">
              <div>
                <h2>Conversies per dag</h2>
                <p>Elke afgeronde laptop, gekleurd naar de gebruikte oplossing.</p>
              </div>
              <span>{period.label}</span>
            </div>
            <div className="conversion-chart" aria-label={`Conversies per dag over ${period.label}`}>
              {buckets.map((bucket, index) => (
                <div key={bucket.startDay} className="conversion-column">
                  <div className="conversion-stack" title={`${bucket.total} conversies`}>
                    {methodsInTierOrder.map((method) => {
                      const count = bucket.byMethod[method];
                      if (count === 0) return null;
                      return (
                        <span
                          key={method}
                          className={`conversion-slice tone-${conversionMethods[method].tone}`}
                          style={{ height: `${(count / tallest) * 100}%` }}
                        />
                      );
                    })}
                    {bucket.total > 0 && <b>{bucket.total}</b>}
                  </div>
                  <small>{index % labelEvery === 0 || index === buckets.length - 1
                    ? formatDayLabel(bucket)
                    : " "}</small>
                </div>
              ))}
            </div>
            <div className="conversion-legend">
              {methodsInTierOrder.map((method) => (
                <span key={method}>
                  <i className={`tone-${conversionMethods[method].tone}`} />
                  {conversionMethods[method].name}
                </span>
              ))}
            </div>
          </section>

          <section className="panel report-card">
            <div className="workspace-card-heading">
              <div><h2>Welke oplossing gebruiken we</h2><p>Aandeel in deze periode, met het verschil t.o.v. de vorige.</p></div>
            </div>
            <div className="method-share-list">
              {shares.map((row) => (
                <div key={row.method}>
                  <div className="method-share-head">
                    <span className={`method-share-name tone-${conversionMethods[row.method].tone}`}>
                      <i className={`tone-${conversionMethods[row.method].tone}`} />
                      {conversionMethods[row.method].name}
                    </span>
                    <b>{row.share.toFixed(0)}%</b>
                  </div>
                  <div className="method-share-bar">
                    <span
                      className={`tone-${conversionMethods[row.method].tone}`}
                      style={{ width: `${row.share}%` }}
                    />
                  </div>
                  <small>
                    {row.current} conversies
                    {row.delta !== 0 && ` · ${row.delta > 0 ? "+" : ""}${row.delta} t.o.v. vorige periode`}
                  </small>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">HARDLOPERS EN STILSTAANDERS</span>
            <h2>Welke hangmappen bewegen</h2>
            <p>Verbruik in deze periode, en hoe lang de huidige voorraad bij dit tempo meegaat.</p>
          </div>
        </div>
        {activeMovers.length === 0 ? (
          <div className="empty">
            In deze periode is geen enkel vel afgeboekt. Kies een langere periode, of wacht
            tot de eerste conversies binnen zijn.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>Hangmap</th>
                  <th>Artikelnummer</th>
                  <th>Verbruikt</th>
                  <th>Vorige periode</th>
                  <th>Voorraad</th>
                  <th>Nog toereikend</th>
                </tr>
              </thead>
              <tbody>
                {activeMovers.slice(0, 15).map((row) => (
                  <tr key={row.catalogKey}>
                    <td><strong className="storage-number">Nr. {row.storageNumber}</strong><span>{row.model}</span></td>
                    <td>{displayStickerSku(row.sku)}</td>
                    <td><b>{row.used}</b><span>{layoutWithCountry(row.layout, row.sku)}</span></td>
                    <td>
                      <strong>{row.previousUsed}</strong>
                      <span className={row.delta > 0 ? "mover-up" : row.delta < 0 ? "mover-down" : ""}>
                        {row.delta === 0
                          ? "gelijk gebleven"
                          : `${Math.abs(row.delta)} ${row.delta > 0 ? "meer" : "minder"}`}
                      </span>
                    </td>
                    <td><b className={row.stock === 0 ? "zero" : ""}>{row.stock}</b></td>
                    <td>
                      {row.weeksOfStock === null
                        ? "—"
                        : row.weeksOfStock < 2
                          ? <span className="resupply-flag">{formatNumber(row.weeksOfStock)} wk</span>
                          : `${formatNumber(row.weeksOfStock)} wk`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeMovers.length > 15 && (
              <p className="report-note">
                De vijftien drukste hangmappen staan hier. Nog {activeMovers.length - 15} andere
                hangmappen hadden verbruik in deze periode.
              </p>
            )}
          </div>
        )}
        <footer className="report-footer">
          <span>{idleWithStock.length} hangmappen met voorraad zonder verbruik in deze periode</span>
          {depth > 0 && <span>{depth} dagen historie opgebouwd</span>}
        </footer>
      </section>
    </div>
  );
}

export function ModelsWorkspace() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const audit = useMemo(() => buildModelGroupAudit(inventoryCatalog), []);
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return audit.groups;
    return audit.groups.filter((group) =>
      `${group.primaryModel} ${group.models.join(" ")} ${group.sku} ${group.layout} ${group.storageNumber}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [audit.groups, query]);
  const selectedGroup = audit.groups.find(({ id }) => id === selectedGroupId) ?? null;

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Hangmapgroepen</span><strong>{audit.groups.length}</strong><small>{audit.blockedSources} bronregels geblokkeerd</small></article>
        <article><span>Unieke modelnamen</span><strong>{audit.uniqueModels}</strong><small>primair en gekoppeld</small></article>
        <article className="attention"><span>Koppeling ontbreekt</span><strong>{audit.needsCompatibility}</strong><small>geen bruikbare modellen in Excel</small></article>
        <article className="attention"><span>Ambigue koppelingen</span><strong>{audit.conflicts.length}</strong><small>model verwijst naar meerdere SKU&apos;s</small></article>
      </section>
      <section className="panel models-panel-full">
        <div className="order-heading">
          <div><span className="workspace-kicker">COMPATIBILITEIT UIT EXCEL</span><h2>Modelgroepen en gedeelde keyboard-layouts</h2><p>Iedere groep toont de echte hangmap, SKU en gekoppelde modellen; niets is automatisch fysiek goedgekeurd.</p></div>
          <label className="global-search"><span className="sr-only">Modelgroepen zoeken</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek model, SKU of hangmap…" /></label>
        </div>
        <div className="catalog-result-line"><span>{groups.length} van {audit.groups.length} groepen zichtbaar</span><button onClick={() => setQuery("")}>Zoekopdracht wissen</button></div>
        <div className="model-group-grid">
          {groups.map((group) => (
            <article key={group.id}>
              <div><span className="model-family-icon">⌨</span><span className={`coverage ${group.status !== "imported_unverified" ? "low" : ""}`}>{modelGroupStatusLabel(group.status)}</span></div>
              <h3>{group.primaryModel}</h3><p>{group.sku || "Artikelnummer ontbreekt"} · {group.layout} · hangmap {group.storageNumber}</p>
              <dl><div><dt>Modellen</dt><dd>{group.models.length}</dd></div><div><dt>Variant</dt><dd>{group.variant}</dd></div></dl>
              <button onClick={() => setSelectedGroupId(group.id)}>Bronkoppeling controleren →</button>
            </article>
          ))}
        </div>
        {groups.length === 0 && <div className="empty">Geen modelgroep gevonden voor deze zoekopdracht.</div>}
        {selectedGroup && (
          <div className="model-selection">
            <div>
              <strong>{selectedGroup.primaryModel} · hangmap {selectedGroup.storageNumber}</strong>
              <span>{selectedGroup.statusReason}</span>
              <small>{selectedGroup.models.join(", ")}</small>
              {selectedGroup.sourceNote && <small>Bronnotitie: {selectedGroup.sourceNote}</small>}
            </div>
            <button className="secondary-button" onClick={() => setSelectedGroupId(null)}>Sluiten</button>
          </div>
        )}
      </section>
      <section className="panel reference-library-panel">
        <div className="order-heading">
          <div><span className="workspace-kicker">CONFLICTWACHTRIJ</span><h2>Modellen met meerdere kandidaat-SKU&apos;s</h2><p>Deze koppelingen blijven ambigu totdat E1/E2, onderdeelnummer, foto en fysieke pastest uitsluitsel geven.</p></div>
          <span className="data-badge">{audit.conflicts.length} te beoordelen</span>
        </div>
        <div className="reference-layout-table">
          {audit.conflicts.slice(0, 12).map((conflict) => (
            <div key={`${conflict.model}-${conflict.layout}`}>
              <span className="reference-layout-code">{conflict.layout}</span>
              <strong>{conflict.model}</strong>
              <b title={conflict.skus.join(", ")}>{conflict.skus.length} kandidaat-SKU&apos;s</b>
              <small>Hangmappen {conflict.storageNumbers.join(", ")}</small>
            </div>
          ))}
        </div>
        {audit.conflicts.length > 12 && <p className="reference-library-note">De eerste 12 conflicten worden getoond. De volledige set blijft beschikbaar in de bron- en auditlaag.</p>}
      </section>
      <section className="panel reference-library-panel">
        <div className="order-heading">
          <div><span className="workspace-kicker">REFERENTIEBIBLIOTHEEK</span><h2>Keyboardlayouts en E1/E2-bewijs</h2><p>Trainingshulp is beschikbaar; compatibiliteitsbewijs wordt pas actief na managementgoedkeuring.</p></div>
          <span className="data-badge">0 goedgekeurde modelfoto&apos;s</span>
        </div>
        <div className="reference-library-summary">
          <article><span>Trainingsillustratie</span><strong>Beschikbaar</strong><small>Algemene toetsvorm- en pasvormcontrole</small></article>
          <article><span>Scandinavische regels</span><strong>{scandinavianLayoutReferences.length} actief</strong><small>SE/FI, NO en DK afzonderlijk</small></article>
          <article className="attention"><span>E1/E2-bewijs</span><strong>Nog verzamelen</strong><small>Exacte SKU, model, foto en fysieke pastest</small></article>
        </div>
        <div className="reference-layout-table">
          {scandinavianLayoutReferences.map((reference) => (
            <div key={reference.value}>
              <span className="reference-layout-code">{reference.value}</span>
              <strong>{reference.shortLabel}</strong>
              <b>{reference.keySymbols}</b>
              <small>Herkenningsregel actief</small>
            </div>
          ))}
        </div>
        <p className="reference-library-note">Databasefundament staat klaar voor status <strong>concept</strong>, <strong>goedgekeurd</strong> of <strong>afgekeurd</strong>. Upload en formele goedkeuring worden aangesloten op de centrale database en persoonlijke managementlogin.</p>
      </section>
    </div>
  );
}

function modelGroupStatusLabel(status: ModelGroupStatus) {
  return {
    blocked_source: "Bron geblokkeerd",
    needs_models: "Modellen ontbreken",
    needs_fit_review: "Pasvorm controleren",
    imported_unverified: "Niet fysiek bevestigd",
  }[status];
}

/**
 * Hier stond een verzonnen wachtrij met drie orders en euro-bedragen. Wat er
 * werkelijk is, is het conversielogboek: wat er is gedaan, en waar Noviply nog
 * aan de beurt is.
 */
export function ConversionsWorkspace({
  onNew,
  conversionLog,
}: {
  onNew: () => void;
  conversionLog: ConversionLogEntry[];
}) {
  const recent = [...conversionLog]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 25);
  const awaiting = conversionLog.filter((entry) => entry.status === "awaiting_print").length;

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Geregistreerd</span><strong>{conversionLog.length}</strong><small>conversies sinds de start</small></article>
        <article className={awaiting > 0 ? "attention" : ""}><span>Wacht op Noviply</span><strong>{awaiting}</strong><small>aangevraagd, nog niet geprint</small></article>
      </section>
      <section className="panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">CONVERSIELOGBOEK</span>
            <h2>Laatste conversies</h2>
            <p>Elke afgeronde laptop, met de gebruikte oplossing en het ordernummer.</p>
          </div>
          <button className="primary-button" onClick={onNew}>Nieuwe conversie</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Wanneer</th><th>Laptop</th><th>Doellayout</th><th>Oplossing</th><th>Order</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>{new Date(entry.occurredAt).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</strong><span>{entry.actor}</span></td>
                  <td><strong>{entry.model}</strong>{entry.storageNumber !== null && <span>hangmap {entry.storageNumber}</span>}</td>
                  <td><span className="layout-badge">{entry.targetLayout}</span></td>
                  <td>
                    <span className={`method-share-name tone-${conversionMethods[entry.method].tone}`}>
                      <i className={`tone-${conversionMethods[entry.method].tone}`} />
                      {conversionMethods[entry.method].name}
                    </span>
                  </td>
                  <td>{entry.orderReference || "—"}</td>
                  <td>
                    <span className={`planning-status ${entry.status === "completed" ? "healthy" : "warning"}`}>
                      {entry.status === "completed" ? "Afgerond" : "Wacht op print"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recent.length === 0 && (
            <div className="empty">Nog geen conversies geregistreerd. Ze verschijnen hier zodra medewerkers er een afronden.</div>
          )}
        </div>
      </section>
    </div>
  );
}
