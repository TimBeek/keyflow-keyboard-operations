"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-demo";
import { calculateForecastAdvice } from "@/domain/forecasting";

const plannedItems = inventoryCatalog
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
  const topItems = [...inventoryCatalog].sort((a, b) => b.averageWeeklyDemand - a.averageWeeklyDemand).slice(0, 6);
  const totalWeekly = inventoryCatalog.reduce((sum, item) => sum + item.averageWeeklyDemand, 0);
  const dormantValue = inventoryCatalog.filter(({ averageWeeklyDemand }) => averageWeeklyDemand === 0).reduce((sum, item) => sum + item.stock * item.unitCost, 0);

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
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const groups = useMemo(() => [
    { family: "Dell Latitude 7x00", models: 14, skus: 4, coverage: 91, note: "7400, 7490, 7300 en aliases" },
    { family: "Dell Latitude 5x00", models: 18, skus: 6, coverage: 86, note: "5300, 5400, 5410, 5420" },
    { family: "HP EliteBook 8xx", models: 22, skus: 7, coverage: 94, note: "830, 840 en 850 generaties" },
    { family: "HP ProBook 4xx/6xx", models: 19, skus: 8, coverage: 82, note: "430, 440, 640 en gekoppelde modellen" },
    { family: "HP ZBook 15/Fury", models: 11, skus: 5, coverage: 78, note: "NL, FR en DE layoutvarianten" },
    { family: "Fujitsu Lifebook U/E", models: 17, skus: 9, coverage: 88, note: "U728, U729, U7410 en E548" },
  ], []);

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Modelgroepen</span><strong>{groups.length}</strong><small>voorbeeldfamilies</small></article>
        <article><span>Gekoppelde modellen</span><strong>{groups.reduce((sum, group) => sum + group.models, 0)}</strong><small>in deze families</small></article>
        <article><span>Gemiddelde dekking</span><strong>{Math.round(groups.reduce((sum, group) => sum + group.coverage, 0) / groups.length)}%</strong><small>compatibiliteit bevestigd</small></article>
        <article className="attention"><span>Te beoordelen</span><strong>31</strong><small>ontbrekende Excel-koppelingen</small></article>
      </section>
      <section className="panel models-panel-full">
        <div className="order-heading"><div><span className="workspace-kicker">COMPATIBILITEIT</span><h2>Modelgroepen en gedeelde keyboard-layouts</h2><p>Eén gevalideerde koppeling kan meerdere laptopmodellen bedienen.</p></div><button className="primary-button" onClick={() => setSelectedFamily("Nieuwe modelgroep")}>Nieuwe modelgroep</button></div>
        <div className="model-group-grid">
          {groups.map((group) => (
            <article key={group.family}>
              <div><span className="model-family-icon">⌨</span><span className={`coverage ${group.coverage < 80 ? "low" : ""}`}>{group.coverage}% getest</span></div>
              <h3>{group.family}</h3><p>{group.note}</p>
              <dl><div><dt>Modellen</dt><dd>{group.models}</dd></div><div><dt>Sticker-SKU&apos;s</dt><dd>{group.skus}</dd></div></dl>
              <button onClick={() => setSelectedFamily(group.family)}>Compatibiliteit beheren →</button>
            </article>
          ))}
        </div>
        {selectedFamily && (
          <div className="model-selection">
            <div><strong>{selectedFamily}</strong><span>{selectedFamily === "Nieuwe modelgroep" ? "Wizard voorbereid voor fabrikant, familie en aliases." : "Compatibiliteitsbeheer geselecteerd; wijzigingen worden later via database en auditlog opgeslagen."}</span></div>
            <button className="secondary-button" onClick={() => setSelectedFamily(null)}>Sluiten</button>
          </div>
        )}
      </section>
    </div>
  );
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
