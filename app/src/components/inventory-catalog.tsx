"use client";

import { useMemo, useState } from "react";
import {
  inventoryCatalog,
  inventoryCatalogSummary,
  planningCatalog,
  type InventoryCatalogItem,
} from "@/data/inventory-catalog";
import { calculateForecastAdvice, type StockAdviceStatus } from "@/domain/forecasting";
import { createInventoryCsv } from "@/domain/inventory-export";

type Props = {
  globalQuery: string;
  quantities: Record<string, number>;
  onReceive: (item: InventoryCatalogItem) => void;
};

type CatalogStatus = StockAdviceStatus | "data_issue" | "unconfigured";
type StatusFilter = "all" | CatalogStatus;

export function InventoryCatalog({ globalQuery, quantities, onReceive }: Props) {
  const [layout, setLayout] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<"urgency" | "stock" | "usage">("urgency");

  const rows = useMemo(() => {
    const priority: Record<CatalogStatus, number> = {
      data_issue: 0,
      out: 1,
      critical: 2,
      order: 3,
      healthy: 4,
      excess: 5,
      unconfigured: 6,
    };
    return inventoryCatalog
      .map((sourceItem) => {
        const item = { ...sourceItem, stock: quantities[sourceItem.sku] ?? sourceItem.stock };
        const advice = item.dataQuality === "ready" && item.planningDataStatus === "sample"
          ? calculateForecastAdvice({
              onHand: item.stock,
              reserved: item.reserved,
              averageWeeklyDemand: item.averageWeeklyDemand,
              leadTimeDays: item.leadTimeDays,
              safetyStockWeeks: item.safetyStockWeeks,
            })
          : null;
        return {
          ...item,
          advice,
          catalogStatus: item.dataQuality === "blocked"
            ? "data_issue" as const
            : advice?.status ?? "unconfigured" as const,
        };
      })
      .filter((item) => {
        const searchable = `${item.modelAliases.join(" ")} ${item.sku} ${item.layout} hangmap ${item.storageNumber}`.toLowerCase();
        return searchable.includes(globalQuery.toLowerCase())
          && (layout === "all" || item.layout === layout)
          && (status === "all" || item.catalogStatus === status)
          && (location === "all" || item.location === location);
      })
      .sort((a, b) => {
        if (sort === "stock") return a.stock - b.stock;
        if (sort === "usage") return b.averageWeeklyDemand - a.averageWeeklyDemand;
        return priority[a.catalogStatus] - priority[b.catalogStatus]
          || (b.advice?.recommendedOrderQuantity ?? 0) - (a.advice?.recommendedOrderQuantity ?? 0)
          || a.storageNumber - b.storageNumber;
      });
  }, [globalQuery, layout, location, quantities, sort, status]);

  const actionCount = planningCatalog.filter((sourceItem) => {
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

  function exportCsv() {
    const blob = new Blob(
      [createInventoryCsv(inventoryCatalog, quantities)],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "keyflow-voorraadcatalogus.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workspace-view">
      <section className="workspace-stats">
        <article><span>Catalogus</span><strong>{inventoryCatalogSummary.rowCount}</strong><small>volledige Excel-hangmappen</small></article>
        <article><span>Momentopname</span><strong>{inventoryCatalogSummary.totalQuantity.toLocaleString("nl-NL")}</strong><small>stickervellen uit de bron</small></article>
        <article className="attention"><span>Bestelactie</span><strong>{actionCount}</strong><small>in getoonde planningsset</small></article>
        <article><span>Broncontrole</span><strong>{inventoryCatalogSummary.blockedRows}</strong><small>regels veilig geblokkeerd</small></article>
      </section>

      <section className="panel catalog-panel">
        <div className="catalog-toolbar">
          <div>
            <h2>Voorraadcatalogus</h2>
            <p>Alle Excelregels, locaties en gekoppelde modellen in één controleerbaar overzicht.</p>
            <button className="secondary-button" type="button" onClick={exportCsv}>Volledige CSV exporteren</button>
          </div>
          <div className="catalog-filters">
            <label><span>Layout</span><select value={layout} onChange={(event) => setLayout(event.target.value)}><option value="all">Alle layouts</option><option>QWERTY US</option><option>AZERTY FR</option><option>QWERTZ DE</option></select></label>
            <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">Alle statussen</option><option value="data_issue">Bronprobleem</option><option value="out">Uitverkocht</option><option value="critical">Kritiek</option><option value="order">Bestellen</option><option value="healthy">Gezond</option><option value="excess">Overvoorraad</option><option value="unconfigured">Planning ontbreekt</option></select></label>
            <label><span>Opslag</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">Alle opslag</option><option>Hangmappenwagen</option></select></label>
            <label><span>Sortering</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="urgency">Urgentie</option><option value="stock">Laagste voorraad</option><option value="usage">Hoogste verbruik</option></select></label>
          </div>
        </div>

        <div className="catalog-result-line">
          <span>{rows.length} van {inventoryCatalogSummary.rowCount} hangmappen · {inventoryCatalogSummary.operationalRows} operationeel · {inventoryCatalogSummary.blockedRows} geblokkeerd</span>
          <button onClick={() => { setLayout("all"); setStatus("all"); setLocation("all"); }}>Filters wissen</button>
        </div>

        <div className="table-wrap">
          <table className="catalog-table">
            <thead><tr><th>Model / SKU</th><th>Layout / hangmap</th><th>Voorraad</th><th>Verbruik</th><th>Dekking</th><th>Planstatus</th><th /></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.catalogKey}>
                  <td><strong>{item.model}</strong><span>{item.sku || "Artikelnummer ontbreekt"} · {item.compatibleModels} gekoppelde modellen</span>{item.dataQualityIssues.map((issue) => <small className="form-error" key={issue}>{issue}</small>)}</td>
                  <td><span className="layout-badge">{item.layout}</span><small>{item.location} · nr. {item.storageNumber}</small></td>
                  <td><b className={item.stock === 0 ? "zero" : ""}>{item.stock}</b><span>{item.reserved} gereserveerd</span></td>
                  <td>{item.advice ? <><strong>{item.averageWeeklyDemand.toLocaleString("nl-NL")} / week</strong><span>{item.leadTimeDays} dagen levertijd</span></> : <><strong>Nog niet gemeten</strong><span>Transactiehistorie vereist</span></>}</td>
                  <td>{item.advice ? <><strong>{item.advice.coverageWeeks === null ? "Geen vraag" : `${item.advice.coverageWeeks} weken`}</strong><span>ROP {item.advice.reorderPoint}</span></> : <strong>—</strong>}</td>
                  <td><span className={`planning-status ${item.catalogStatus}`}>{statusLabel(item.catalogStatus)}</span>{item.advice && item.advice.recommendedOrderQuantity > 0 && <small>Advies +{item.advice.recommendedOrderQuantity}</small>}</td>
                  <td><button className="row-action" disabled={item.dataQuality === "blocked"} onClick={() => onReceive(item)}>Ontvangen</button></td>
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

function statusLabel(status: CatalogStatus) {
  return {
    data_issue: "Bronprobleem",
    out: "Uitverkocht",
    critical: "Kritiek",
    order: "Bestellen",
    healthy: "Gezond",
    excess: "Overvoorraad",
    unconfigured: "Planning ontbreekt",
  }[status];
}
