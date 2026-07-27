"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog, type InventoryCatalogItem } from "@/data/inventory-demo";
import { calculateForecastAdvice, type StockAdviceStatus } from "@/domain/forecasting";

type Props = {
  globalQuery: string;
  quantities: Record<string, number>;
  onReceive: (item: InventoryCatalogItem) => void;
};

type StatusFilter = "all" | StockAdviceStatus;

export function InventoryCatalog({ globalQuery, quantities, onReceive }: Props) {
  const [layout, setLayout] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<"urgency" | "stock" | "usage">("urgency");

  const rows = useMemo(() => {
    const priority: Record<StockAdviceStatus, number> = {
      out: 0,
      critical: 1,
      order: 2,
      healthy: 3,
      excess: 4,
    };
    return inventoryCatalog
      .map((sourceItem) => {
        const item = { ...sourceItem, stock: quantities[sourceItem.sku] ?? sourceItem.stock };
        return {
        ...item,
        advice: calculateForecastAdvice({
          onHand: item.stock,
          reserved: item.reserved,
          averageWeeklyDemand: item.averageWeeklyDemand,
          leadTimeDays: item.leadTimeDays,
          safetyStockWeeks: item.safetyStockWeeks,
        }),
        };
      })
      .filter((item) => {
        const searchable = `${item.model} ${item.sku} ${item.layout}`.toLowerCase();
        return searchable.includes(globalQuery.toLowerCase())
          && (layout === "all" || item.layout === layout)
          && (status === "all" || item.advice.status === status)
          && (location === "all" || item.location === location);
      })
      .sort((a, b) => {
        if (sort === "stock") return a.stock - b.stock;
        if (sort === "usage") return b.averageWeeklyDemand - a.averageWeeklyDemand;
        return priority[a.advice.status] - priority[b.advice.status]
          || b.advice.recommendedOrderQuantity - a.advice.recommendedOrderQuantity;
      });
  }, [globalQuery, layout, location, quantities, sort, status]);

  const totalValue = inventoryCatalog.reduce((sum, item) => sum + (quantities[item.sku] ?? item.stock) * item.unitCost, 0);
  const actionCount = inventoryCatalog.filter((sourceItem) => {
    const item = { ...sourceItem, stock: quantities[sourceItem.sku] ?? sourceItem.stock };
    const advice = calculateForecastAdvice({
      onHand: item.stock,
      reserved: item.reserved,
      averageWeeklyDemand: item.averageWeeklyDemand,
      leadTimeDays: item.leadTimeDays,
      safetyStockWeeks: item.safetyStockWeeks,
    });
    return advice.status === "out" || advice.status === "critical" || advice.status === "order";
  }).length;

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Catalogus</span><strong>148</strong><small>SKU-layoutcombinaties</small></article>
        <article><span>Momentopname</span><strong>3.218</strong><small>stickervellen totaal</small></article>
        <article className="attention"><span>Bestelactie</span><strong>{actionCount}</strong><small>in getoonde planningsset</small></article>
        <article><span>Voorraadwaarde</span><strong>€ {totalValue.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}</strong><small>indicatieve kostprijs</small></article>
      </section>

      <section className="panel catalog-panel">
        <div className="catalog-toolbar">
          <div>
            <h2>Voorraadcatalogus</h2>
            <p>Zoek, filter en plan vanuit één actueel overzicht.</p>
          </div>
          <div className="catalog-filters">
            <label><span>Layout</span><select value={layout} onChange={(event) => setLayout(event.target.value)}><option value="all">Alle layouts</option><option>QWERTY US</option><option>AZERTY FR</option><option>QWERTZ DE</option></select></label>
            <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">Alle statussen</option><option value="out">Uitverkocht</option><option value="critical">Kritiek</option><option value="order">Bestellen</option><option value="healthy">Gezond</option><option value="excess">Overvoorraad</option></select></label>
            <label><span>Locatie</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">Alle locaties</option><option>Stickerafdeling</option><option>Kantoorvoorraad</option></select></label>
            <label><span>Sortering</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="urgency">Urgentie</option><option value="stock">Laagste voorraad</option><option value="usage">Hoogste verbruik</option></select></label>
          </div>
        </div>

        <div className="catalog-result-line">
          <span>{rows.length} van 24 voorbeeldregels · bronbestand bevat 148 regels</span>
          <button onClick={() => { setLayout("all"); setStatus("all"); setLocation("all"); }}>Filters wissen</button>
        </div>

        <div className="table-wrap">
          <table className="catalog-table">
            <thead><tr><th>Model / SKU</th><th>Layout / locatie</th><th>Voorraad</th><th>Verbruik</th><th>Dekking</th><th>Planstatus</th><th /></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={`${item.sku}-${item.layout}`}>
                  <td><strong>{item.model}</strong><span>{item.sku} · {item.compatibleModels} modellen</span></td>
                  <td><span className="layout-badge">{item.layout}</span><small>{item.location}</small></td>
                  <td><b className={item.stock === 0 ? "zero" : ""}>{item.stock}</b><span>{item.reserved} gereserveerd</span></td>
                  <td><strong>{item.averageWeeklyDemand.toLocaleString("nl-NL")} / week</strong><span>{item.leadTimeDays} dagen levertijd</span></td>
                  <td><strong>{item.advice.coverageWeeks === null ? "Geen vraag" : `${item.advice.coverageWeeks} weken`}</strong><span>ROP {item.advice.reorderPoint}</span></td>
                  <td><span className={`planning-status ${item.advice.status}`}>{statusLabel(item.advice.status)}</span>{item.advice.recommendedOrderQuantity > 0 && <small>Advies +{item.advice.recommendedOrderQuantity}</small>}</td>
                  <td><button className="row-action" onClick={() => onReceive(item)}>Ontvangen</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">Geen voorraadregels gevonden voor deze filters.</div>}
        </div>
      </section>
    </div>
  );
}

function statusLabel(status: StockAdviceStatus) {
  return {
    out: "Uitverkocht",
    critical: "Kritiek",
    order: "Bestellen",
    healthy: "Gezond",
    excess: "Overvoorraad",
  }[status];
}
