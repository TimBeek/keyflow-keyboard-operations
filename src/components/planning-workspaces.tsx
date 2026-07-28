"use client";

import { useMemo, useState } from "react";
import {
  inventoryCatalog,
  planningCatalog,
} from "@/data/inventory-catalog";
import { calculateForecastAdvice } from "@/domain/forecasting";
import { scandinavianLayoutReferences } from "@/domain/keyboard-layouts";
import {
  buildModelGroupAudit,
  type ModelGroupStatus,
} from "@/domain/model-groups";

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

export function ReportsWorkspace() {
  const weeklyUsage = [72, 85, 68, 94, 101, 88, 113, 96];
  const maxUsage = Math.max(...weeklyUsage);
  const topItems = [...planningCatalog].sort((a, b) => b.averageWeeklyDemand - a.averageWeeklyDemand).slice(0, 6);
  const totalWeekly = planningCatalog.reduce((sum, item) => sum + item.averageWeeklyDemand, 0);
  const dormantValue = planningCatalog.filter(({ averageWeeklyDemand }) => averageWeeklyDemand === 0).reduce((sum, item) => sum + item.stock * item.unitCost, 0);

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Gemiddeld verbruik</span><strong>{totalWeekly.toFixed(0)}</strong><small>vellen per week · planningsset</small></article>
        <article><span>8-weeks piek</span><strong>{maxUsage}</strong><small>vellen in één week</small></article>
        <article><span>Voorraaddekking</span><strong>7,4 wk</strong><small>gewogen gemiddelde</small></article>
        <article className="attention"><span>Dode voorraad</span><strong>€ {dormantValue.toFixed(0)}</strong><small>geen gemeten vraag</small></article>
      </section>
      <div className="report-grid">
        <section className="panel report-card usage-chart">
          <div className="workspace-card-heading"><div><h2>Verbruik laatste 8 weken</h2><p>Alle geregistreerde stickeruitgiftes</p></div><span>+12% vs. vorige periode</span></div>
          <div className="bar-chart" aria-label="Weekverbruik">
            {weeklyUsage.map((value, index) => (
              <div key={index}><span style={{ height: `${Math.round(value / maxUsage * 100)}%` }}><b>{value}</b></span><small>W{index + 21}</small></div>
            ))}
          </div>
        </section>
        <section className="panel report-card">
          <div className="workspace-card-heading"><div><h2>Snelste dalers</h2><p>Gemiddeld verbruik per week</p></div></div>
          <div className="ranking-list">
            {topItems.map((item, index) => (
              <div key={item.sku}><span>{index + 1}</span><p><strong>{item.model}</strong><small>{item.sku}</small></p><b>{item.averageWeeklyDemand}/wk</b></div>
            ))}
          </div>
        </section>
        <section className="panel report-card forecast-card">
          <div className="workspace-card-heading"><div><h2>Vooruitblik</h2><p>Verwacht verbruik op basis van huidige run-rate</p></div></div>
          <div className="forecast-horizons">
            <div><span>1 maand</span><strong>{Math.round(totalWeekly * 4.33)}</strong><small>verwachte vellen</small></div>
            <div><span>3 maanden</span><strong>{Math.round(totalWeekly * 13)}</strong><small>verwachte vellen</small></div>
            <div><span>6 maanden</span><strong>{Math.round(totalWeekly * 26)}</strong><small>verwachte vellen</small></div>
          </div>
          <p className="forecast-disclaimer">Eerste statistische basis. Seizoenscorrectie wordt betrouwbaar zodra minimaal 12 maanden transactiedata beschikbaar is.</p>
        </section>
      </div>
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

export function ConversionsWorkspace({ onNew }: { onNew: () => void }) {
  const queue = [
    { order: "ORD-260727-1842", model: "Dell Latitude 5420", target: "AZERTY FR", value: 279, method: "Noviply voorraadvel", status: "Wacht op uitvoering" },
    { order: "ORD-260727-1848", model: "HP EliteBook 850 G7", target: "QWERTY US", value: 429, method: "Directe keyboardprint", status: "Kwaliteitscontrole" },
    { order: "ORD-260727-1851", model: "HP ZBook 15 G3", target: "QWERTZ DE", value: 245, method: "Sterke printsticker", status: "Vrijgegeven" },
  ];
  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Open wachtrij</span><strong>{queue.length}</strong><small>conversies in behandeling</small></article>
        <article><span>Keyboardprint</span><strong>1</strong><small>premium route</small></article>
        <article><span>Stickerconversies</span><strong>2</strong><small>onder €300</small></article>
        <article><span>Kwaliteitscontrole</span><strong>1</strong><small>vereist actie</small></article>
      </section>
      <section className="panel">
        <div className="order-heading"><div><span className="workspace-kicker">CONVERSIEWACHTRIJ</span><h2>Actieve keyboardconversies</h2><p>Beleidsadvies, gekozen methode en voortgang per order.</p></div><button className="primary-button" onClick={onNew}>Nieuwe conversie</button></div>
        <div className="table-wrap"><table><thead><tr><th>Order</th><th>Laptop</th><th>Doellayout</th><th>Verkoopwaarde</th><th>Methode</th><th>Status</th></tr></thead><tbody>{queue.map((job) => <tr key={job.order}><td><strong>{job.order}</strong></td><td><strong>{job.model}</strong></td><td><span className="layout-badge">{job.target}</span></td><td><strong>€ {job.value}</strong></td><td><strong>{job.method}</strong></td><td><span className="planning-status healthy">{job.status}</span></td></tr>)}</tbody></table></div>
      </section>
    </div>
  );
}
