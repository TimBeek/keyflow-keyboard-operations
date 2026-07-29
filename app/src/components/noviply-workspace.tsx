"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-catalog";
import {
  calculateCatalogThreshold,
  inventoryQuantity,
} from "@/domain/inventory-quantities";
import { layoutWithCountry } from "@/domain/operations";
import {
  printRequestStatusLabel,
  printRequestTotals,
  type PrintRequestRecord,
  type PrintRequestStatus,
} from "@/domain/print-requests";

type Props = {
  printRequests: PrintRequestRecord[];
  quantities: Record<string, number>;
  onSettlePrintRequest: (
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
  ) => void;
};

function formatMoment(value: string) {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return value;
  return moment.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NoviplyWorkspace({
  printRequests,
  quantities,
  onSettlePrintRequest,
}: Props) {
  const [blockedId, setBlockedId] = useState("");
  const [blockedNote, setBlockedNote] = useState("");
  const [message, setMessage] = useState("");

  const totals = printRequestTotals(printRequests);
  const open = printRequests
    .filter((request) => request.status === "requested")
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  const handled = printRequests
    .filter((request) => request.status !== "requested")
    .sort((left, right) => (right.handledAt ?? "").localeCompare(left.handledAt ?? ""))
    .slice(0, 25);

  /** Wat bijna op is, moet Noviply nazenden. Alleen dat is hier relevant. */
  const running = useMemo(() => inventoryCatalog
    .filter((item) => item.dataQuality === "ready")
    .map((item) => {
      const stock = inventoryQuantity(quantities, item);
      const threshold = calculateCatalogThreshold(
        item.averageWeeklyDemand,
        item.leadTimeDays,
        item.safetyStockWeeks,
      );
      return { item, stock, threshold, shortfall: threshold - stock };
    })
    .filter((row) => row.shortfall > 0)
    .sort((left, right) => right.shortfall - left.shortfall)
    .slice(0, 25), [quantities]);

  function settle(
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
  ) {
    try {
      onSettlePrintRequest(record, status, note);
      setBlockedId("");
      setBlockedNote("");
      setMessage(status === "printed"
        ? `${record.model} afgevinkt als geprint.`
        : `${record.model} gemeld als niet te printen.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan is niet gelukt.");
    }
  }

  return (
    <div className="noviply-workspace">
      <div className="noviply-totals">
        <article>
          <span>NOG TE DOEN</span>
          <strong className={totals.open > 0 ? "attention" : ""}>{totals.open}</strong>
          <small>aanvragen wachten op printen</small>
        </article>
        <article>
          <span>GEPRINT</span>
          <strong>{totals.printed}</strong>
          <small>afgerond in deze pilot</small>
        </article>
        <article>
          <span>KAN NIET</span>
          <strong>{totals.notPrintable}</strong>
          <small>met opgegeven reden</small>
        </article>
        <article>
          <span>NAZENDEN</span>
          <strong className={running.length > 0 ? "attention" : ""}>{running.length}</strong>
          <small>hangmappen onder hun minimum</small>
        </article>
      </div>

      <section className="noviply-panel">
        <div className="noviply-panel-head">
          <div>
            <h3>Bestellijst</h3>
            <p>
              De ochtendronde voor buitenlandse orders loopt automatisch. Hier staat
              alleen wat er extra bij moet — verkeerde layout, of een oudere order die
              opnieuw langskomt.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Merk / model</th>
                <th>Taal</th>
                <th>Enter</th>
                <th>Ordernummer</th>
                <th>Aangevraagd</th>
                <th>Actie</th>
              </tr>
            </thead>
            <tbody>
              {open.map((request) => (
                <tr key={request.id}>
                  <td><strong>{request.brand}</strong><span>{request.model}</span></td>
                  <td>{request.layout}</td>
                  <td>{request.variant || "—"}</td>
                  <td>{request.orderReference || "—"}</td>
                  <td>
                    <strong>{formatMoment(request.requestedAt)}</strong>
                    <span>{request.reason || request.requestedBy}</span>
                  </td>
                  <td>
                    {blockedId === request.id ? (
                      <div className="noviply-blocked">
                        <input
                          value={blockedNote}
                          onChange={(event) => setBlockedNote(event.target.value)}
                          placeholder="Waarom kan dit niet?"
                          maxLength={200}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="danger-ghost-button"
                          onClick={() => settle(request, "not_printable", blockedNote)}
                        >
                          Melden
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBlockedId(""); setBlockedNote(""); }}
                        >
                          Terug
                        </button>
                      </div>
                    ) : (
                      <div className="noviply-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => settle(request, "printed", "")}
                        >
                          Geprint
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBlockedId(request.id); setBlockedNote(""); }}
                        >
                          Kan niet
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {open.length === 0 && (
            <div className="empty">Niets extra aangevraagd. De ochtendronde dekt alles.</div>
          )}
        </div>
        {message && <div className="policy-saved" role="status">{message}</div>}
      </section>

      <section className="noviply-panel">
        <div className="noviply-panel-head">
          <div>
            <h3>Voorraad die leeg loopt</h3>
            <p>Hangmappen waarvan de voorraad onder het rekenkundig minimum zakt.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="operations-table">
            <thead>
              <tr>
                <th>Hangmap</th>
                <th>Artikelnummer</th>
                <th>Layout</th>
                <th>Voorraad</th>
                <th>Tekort</th>
              </tr>
            </thead>
            <tbody>
              {running.map(({ item, stock, threshold, shortfall }) => (
                <tr key={item.catalogKey}>
                  <td><strong className="storage-number">Nr. {item.storageNumber}</strong><span>{item.model}</span></td>
                  <td>{item.sku}</td>
                  <td>{layoutWithCountry(item.layout, item.sku)}</td>
                  <td><b className={stock === 0 ? "zero" : ""}>{stock}</b><span> / min. {threshold}</span></td>
                  <td><strong>{shortfall}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {running.length === 0 && (
            <div className="empty">Alle hangmappen zitten boven hun minimum.</div>
          )}
        </div>
      </section>

      {handled.length > 0 && (
        <section className="noviply-panel">
          <div className="noviply-panel-head">
            <div><h3>Laatst afgehandeld</h3></div>
          </div>
          <div className="table-wrap">
            <table className="operations-table">
              <thead>
                <tr><th>Merk / model</th><th>Taal</th><th>Uitkomst</th><th>Afgehandeld</th></tr>
              </thead>
              <tbody>
                {handled.map((request) => (
                  <tr key={request.id}>
                    <td><strong>{request.brand}</strong><span>{request.model}</span></td>
                    <td>{request.layout}</td>
                    <td>
                      <span className={`print-status ${request.status}`}>
                        {printRequestStatusLabel(request.status)}
                      </span>
                      {request.note && <span>{request.note}</span>}
                    </td>
                    <td>{request.handledAt ? formatMoment(request.handledAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
