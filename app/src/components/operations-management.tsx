"use client";

import { useMemo, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-demo";
import {
  calculateAbcAnalysis,
  type InventoryTransactionEntry,
  type OperationsPolicy,
  type OperationalMethodId,
} from "@/domain/operations";

type Props = {
  quantities: Record<string, number>;
  transactions: InventoryTransactionEntry[];
  policy: OperationsPolicy;
  onPolicyChange: (policy: OperationsPolicy) => void;
};

type Tab = "abc" | "ledger" | "policy";

const methodLabels: Record<OperationalMethodId, { name: string; detail: string }> = {
  loose_stickers: { name: "Losse stickers", detail: "Uitfaseringsfallback" },
  noviply_sheet: { name: "Oude Noviply-voorraadvel", detail: "Exact SKU-nummer verplicht" },
  printed_sticker: { name: "Sterke printsticker", detail: "First-time-right" },
  direct_reprint: { name: "Directe keyboardprint", detail: "Premiumroute" },
};

export function OperationsManagement({
  quantities,
  transactions,
  policy,
  onPolicyChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("abc");
  const [draft, setDraft] = useState(policy);
  const [saved, setSaved] = useState("");

  const analysis = useMemo(
    () => calculateAbcAnalysis(inventoryCatalog, transactions, policy),
    [policy, transactions],
  );
  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 18),
    [transactions],
  );
  const issued = transactions
    .filter((entry) => entry.quantityDelta < 0)
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);
  const received = transactions
    .filter((entry) => entry.quantityDelta > 0)
    .reduce((sum, entry) => sum + entry.quantityDelta, 0);
  const currentStock = inventoryCatalog.reduce(
    (sum, item) => sum + (quantities[item.sku] ?? item.stock),
    0,
  );
  const mismatchCount = transactions
    .filter((entry) => entry.reasonCode === "fit_mismatch")
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);

  function updateMethod(method: OperationalMethodId, enabled: boolean) {
    setDraft((current) => ({
      ...current,
      methodEnabled: { ...current.methodEnabled, [method]: enabled },
    }));
    setSaved("");
  }

  function savePolicy() {
    if (
      draft.thresholdEur <= 0
      || draft.abcAThreshold <= 0
      || draft.abcBThreshold >= 100
      || draft.abcAThreshold >= draft.abcBThreshold
    ) {
      setSaved("Controleer de verkoopwaardegrens en ABC-percentages.");
      return;
    }
    onPolicyChange(draft);
    setSaved("Configuratie actief gemaakt voor werknemersadvies.");
  }

  return (
    <div className="workspace-view operations-workspace">
      <section className="workspace-stats">
        <article><span>Actuele voorbeeldvoorraad</span><strong>{currentStock}</strong><small>vellen in de geladen catalogus</small></article>
        <article><span>Uitgeboekt</span><strong>{issued}</strong><small>12-wekenbasis + live sessie</small></article>
        <article><span>Ingeboekt</span><strong>{received}</strong><small>leveringen en correcties</small></article>
        <article className={mismatchCount > 0 ? "attention" : ""}><span>Past niet / uitval</span><strong>{mismatchCount}</strong><small>apart analyseerbare vellen</small></article>
      </section>

      <section className="panel operations-panel">
        <div className="order-heading">
          <div>
            <span className="workspace-kicker">OPERATIONEEL BEHEER</span>
            <h2>Voorraadbewegingen en conversiebeleid</h2>
            <p>Beheer het werknemersadvies en stuur op werkelijk in- en uitgaand gebruik.</p>
          </div>
          <span className="data-badge">12 weken voorbeelddata + sessieboekingen</span>
        </div>

        <div className="operations-tabs" role="tablist" aria-label="Operationeel beheer">
          <button className={tab === "abc" ? "active" : ""} onClick={() => setTab("abc")}>ABC & hardlopers</button>
          <button className={tab === "ledger" ? "active" : ""} onClick={() => setTab("ledger")}>Boekingen</button>
          <button className={tab === "policy" ? "active" : ""} onClick={() => setTab("policy")}>Configuratie</button>
        </div>

        {tab === "abc" && (
          <div className="operations-tab-content">
            <div className="abc-summary">
              {(["A", "B", "C"] as const).map((abcClass) => {
                const rows = analysis.filter((row) => row.abcClass === abcClass);
                return (
                  <article className={`abc-card class-${abcClass.toLowerCase()}`} key={abcClass}>
                    <span>Klasse {abcClass}</span>
                    <strong>{rows.length} SKU&apos;s</strong>
                    <small>{abcClass === "A" ? "Hardlopers: hoogste gebruikswaarde" : abcClass === "B" ? "Middenlopers: regelmatig gebruik" : "Zachtlopers: beperkt of geen verbruik"}</small>
                  </article>
                );
              })}
            </div>
            <div className="table-wrap">
              <table className="operations-table">
                <thead><tr><th>Klasse</th><th>Sticker / model</th><th>Variant</th><th>Uit</th><th>In</th><th>Netto</th><th>Aandeel</th></tr></thead>
                <tbody>
                  {analysis.slice(0, 14).map((row) => (
                    <tr key={row.sku}>
                      <td><span className={`abc-pill class-${row.abcClass.toLowerCase()}`}>{row.abcClass}</span><small>{row.velocity}</small></td>
                      <td><strong>{row.sku}</strong><span>{row.model} · {row.layout}</span></td>
                      <td><strong>{row.sku.match(/E\d+/i)?.[0] ?? "—"}</strong></td>
                      <td><b className="movement-out">−{row.issueUnits}</b></td>
                      <td><b className="movement-in">+{row.receiptUnits}</b></td>
                      <td><strong>{formatDelta(row.netMovement)}</strong></td>
                      <td><strong>{row.sharePercentage.toFixed(1)}%</strong><span>cum. {row.cumulativePercentage.toFixed(1)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="analysis-explanation">ABC wordt berekend op uitgaande gebruikswaarde: aantal uitgeboekte vellen × kostprijs. Daardoor kunnen dure of veelgebruikte SKU&apos;s als eerste aandacht krijgen.</p>
          </div>
        )}

        {tab === "ledger" && (
          <div className="operations-tab-content">
            <div className="ledger-filter-line">
              <span><i className="movement-in" /> Ontvangst</span>
              <span><i className="movement-out" /> Verbruik of uitval</span>
              <strong>{transactions.length} boekingen zichtbaar</strong>
            </div>
            <div className="table-wrap">
              <table className="operations-table ledger-table">
                <thead><tr><th>Moment</th><th>SKU / model</th><th>Mutatie</th><th>Reden</th><th>Door / referentie</th></tr></thead>
                <tbody>
                  {recentTransactions.map((entry) => (
                    <tr key={entry.id}>
                      <td><strong>{formatDate(entry.occurredAt)}</strong></td>
                      <td><strong>{entry.sku}</strong><span>{entry.model}</span></td>
                      <td><b className={entry.quantityDelta > 0 ? "movement-in" : "movement-out"}>{formatDelta(entry.quantityDelta)}</b></td>
                      <td><strong>{reasonLabel(entry.reasonCode)}</strong><span>{entry.notes || "Geen toelichting"}</span></td>
                      <td><strong>{entry.actor}</strong><span>{entry.reference || "Geen referentie"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "policy" && (
          <div className="operations-tab-content policy-grid">
            <section className="policy-editor">
              <h3>Conversieregels</h3>
              <label><span>Verkoopwaardegrens keyboardprint</span><div className="money-input"><b>€</b><input type="number" min="1" value={draft.thresholdEur} onChange={(event) => setDraft({ ...draft, thresholdEur: Number(event.target.value) })} /></div></label>
              <label><span>Actuele werkdruk</span><select value={draft.workload} onChange={(event) => setDraft({ ...draft, workload: event.target.value as OperationsPolicy["workload"] })}><option value="normal">Normaal</option><option value="busy">Druk</option><option value="critical">Kritiek</option></select></label>
              <h4>Beschikbare methoden</h4>
              <div className="method-toggles">
                {(Object.keys(methodLabels) as OperationalMethodId[]).map((method) => (
                  <label key={method}><input type="checkbox" checked={draft.methodEnabled[method]} onChange={(event) => updateMethod(method, event.target.checked)} /><span><strong>{methodLabels[method].name}</strong><small>{methodLabels[method].detail}</small></span></label>
                ))}
              </div>
            </section>
            <section className="policy-editor">
              <h3>Werknemersrechten</h3>
              <label className="permission-toggle"><input type="checkbox" checked={draft.employeeCanReceive} onChange={(event) => setDraft({ ...draft, employeeCanReceive: event.target.checked })} /><span><strong>Leveringen inboeken</strong><small>Nieuwe Noviply-vellen ontvangen met pakbonreferentie.</small></span></label>
              <label className="permission-toggle"><input type="checkbox" checked={draft.employeeCanBookMismatch} onChange={(event) => setDraft({ ...draft, employeeCanBookMismatch: event.target.checked })} /><span><strong>Niet-passende sticker afboeken</strong><small>Uitval apart registreren voor kwaliteitsanalyse.</small></span></label>
              <h3>ABC-grenzen</h3>
              <div className="abc-inputs">
                <label><span>A tot en met</span><input type="number" min="1" max="98" value={draft.abcAThreshold} onChange={(event) => setDraft({ ...draft, abcAThreshold: Number(event.target.value) })} /><b>%</b></label>
                <label><span>B tot en met</span><input type="number" min="2" max="99" value={draft.abcBThreshold} onChange={(event) => setDraft({ ...draft, abcBThreshold: Number(event.target.value) })} /><b>%</b></label>
              </div>
              <button className="primary-button policy-save" onClick={savePolicy}>Configuratie actief maken</button>
              {saved && <div className={saved.startsWith("Controleer") ? "form-error" : "policy-saved"}>{saved}</div>}
            </section>
            <section className="ai-readiness">
              <div><span>AI-VOORBEREIDING</span><h3>Modelgroepen pas voorstellen na betere brondata</h3></div>
              <p>AI mag straks mogelijke gedeelde keyboards zoeken, maar nooit zelfstandig compatibiliteit goedkeuren. E1/E2, keyboardfoto, fabrikantonderdeelnummer en een fysieke pastest blijven expliciete bewijsvelden.</p>
              <ul>
                <li className="ready">Modelnamen en huidige SKU&apos;s aanwezig</li>
                <li className="ready">E1/E2 uit SKU uitleesbaar</li>
                <li>Fabrikantonderdeelnummers verzamelen</li>
                <li>Foto&apos;s en toetsenbordafmetingen verzamelen</li>
                <li>Mislukte pastesten structureel registreren</li>
              </ul>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function reasonLabel(reason: string) {
  return {
    conversion_usage: "Automatisch na conversie",
    supplier_delivery: "Levering leverancier",
    fit_mismatch: "Sticker past niet",
    quality_scrap: "Kwaliteitsuitval",
    manual_issue: "Handmatig afgeboekt",
  }[reason] ?? reason;
}
