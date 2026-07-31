"use client";

import { useMemo, useState } from "react";
import {
  createGoLiveAcceptanceDossier,
  goLiveAcceptanceGateLabels,
  goLiveAcceptanceGateRequirements,
  goLiveAcceptanceGates,
  goLiveAcceptanceSummary,
  latestGoLiveAcceptanceByGate,
  type GoLiveAcceptanceDecision,
  type GoLiveAcceptanceGate,
  type GoLiveAcceptanceInput,
  type GoLiveAcceptanceRecord,
} from "@/domain/go-live-acceptance";

export type AcceptanceSyncState = {
  mode: "local" | "central";
  status: "local" | "loading" | "saving" | "ready" | "error";
  message: string;
};

type Props = {
  records: GoLiveAcceptanceRecord[];
  actorName: string;
  sync: AcceptanceSyncState;
  onRefresh: () => void;
  onRecord: (input: GoLiveAcceptanceInput) => Promise<GoLiveAcceptanceRecord>;
};

const checkLabels = {
  scopeConfirmed: "Scope en acceptatiecriteria bevestigd",
  testCompleted: "Test daadwerkelijk uitgevoerd",
  evidenceAttached: "Herleidbaar bewijs toegevoegd",
  ownerApproved: "Verantwoordelijke eigenaar akkoord",
} as const;

export function GoLiveAcceptanceCenter({
  records,
  actorName,
  sync,
  onRefresh,
  onRecord,
}: Props) {
  const [gate, setGate] = useState<GoLiveAcceptanceGate>("database_recovery");
  const [ownerName, setOwnerName] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [evidenceDate, setEvidenceDate] = useState("");
  const [decision, setDecision] = useState<GoLiveAcceptanceDecision>("pending");
  const [checks, setChecks] = useState({
    scopeConfirmed: false,
    testCompleted: false,
    evidenceAttached: false,
    ownerApproved: false,
  });
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const latest = useMemo(() => latestGoLiveAcceptanceByGate(records), [records]);
  const summary = useMemo(() => goLiveAcceptanceSummary(records), [records]);
  const sortedRecords = useMemo(
    () => [...records]
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt)),
    [records],
  );
  const openGates = useMemo(
    () => goLiveAcceptanceGates.filter(
      (acceptanceGate) => latest.get(acceptanceGate)?.decision !== "approved",
    ),
    [latest],
  );

  function downloadDossier() {
    const generatedAt = new Date().toISOString();
    const dossier = createGoLiveAcceptanceDossier(records, {
      generatedAt,
      generatedBy: actorName,
      storageMode: sync.mode,
    });
    const blob = new Blob([JSON.stringify(dossier, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekey-go-live-dossier-${generatedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportMessage("Controleerbaar JSON-dossier gedownload.");
  }

  function printDossier() {
    const generatedAt = new Date().toISOString();
    setReportGeneratedAt(generatedAt);
    setExportMessage("Kies in het afdrukvenster ‘Opslaan als PDF’ voor een PDF-dossier.");
    window.setTimeout(() => window.print(), 0);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const record = await onRecord({
        gate,
        ownerName,
        evidenceReference,
        evidenceDate: evidenceDate ? new Date(evidenceDate).toISOString() : null,
        checks,
        decision,
        notes,
      });
      setMessage(
        record.decision === "approved"
          ? `${goLiveAcceptanceGateLabels[record.gate].label} is als goedgekeurd vastgelegd.`
          : record.decision === "rejected"
            ? "Afwijzing en vervolgactie zijn vastgelegd."
            : "Tussenstand is zonder vrijgave vastgelegd.",
      );
      setEvidenceReference("");
      setEvidenceDate("");
      setNotes("");
      setChecks({
        scopeConfirmed: false,
        testCompleted: false,
        evidenceAttached: false,
        ownerApproved: false,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Het vrijgavebesluit kon niet worden opgeslagen.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="operations-tab-content release-center">
      <header className="release-print-header">
        <span>KEYFLOW · FORMEEL GO-LIVEDOSSIER</span>
        <h1>Productievrijgave</h1>
        <p>
          Gegenereerd door {actorName}
          {reportGeneratedAt ? ` op ${formatDate(reportGeneratedAt)}` : ""}
          {" · "}{sync.mode === "central" ? "centrale PostgreSQL-bron" : "lokale pilotbron"}
        </p>
      </header>

      <section className={`release-sync-banner ${sync.status}`}>
        <div>
          <span>{sync.mode === "central" ? "CENTRAAL GO-LIVEDOSSIER" : "PILOT GO-LIVEDOSSIER"}</span>
          <strong>{sync.mode === "central" ? "Persoonlijk en centraal auditbaar" : "Lokale voorbereiding zonder productie-effect"}</strong>
          <small>{sync.message}</small>
        </div>
        <div className="continuity-sync-actions">
          <span className={`readiness-status ${sync.status === "error" ? "action_required" : sync.status === "local" ? "external" : "ready"}`}>
            {sync.status === "error" ? "Actie nodig" : sync.status === "local" ? "Pilot" : sync.status === "ready" ? "Gesynchroniseerd" : "Bezig"}
          </span>
          {sync.mode === "central" && (
            <button className="secondary-button" type="button" onClick={onRefresh} disabled={sync.status === "loading" || sync.status === "saving"}>
              Opnieuw laden
            </button>
          )}
          <button className="secondary-button" type="button" onClick={downloadDossier}>
            JSON-dossier
          </button>
          <button className="secondary-button" type="button" onClick={printDossier}>
            Afdrukken / PDF
          </button>
        </div>
      </section>
      {exportMessage && (
        <div className="release-export-note" role="status">{exportMessage}</div>
      )}

      <section className={`release-decision-banner ${summary.canRelease ? "approved" : "blocked"}`}>
        <div>
          <span>FORMELE PRODUCTIEVRIJGAVE</span>
          <strong>{summary.canRelease ? "Alle vijf poorten zijn goedgekeurd" : "Productievrijgave blijft geblokkeerd"}</strong>
          <small>{summary.approved} goedgekeurd · {summary.pending} open · {summary.rejected} afgewezen</small>
        </div>
        <b>{summary.approved}/{summary.total}</b>
      </section>

      <section className={`release-open-actions ${summary.canRelease ? "approved" : ""}`}>
        <div>
          <span>{summary.canRelease ? "VRIJGAVEBESLUIT" : "OPEN ACTIES"}</span>
          <strong>
            {summary.canRelease
              ? "Geen openstaande vrijgavepoort"
              : `${openGates.length} ${openGates.length === 1 ? "poort vereist" : "poorten vereisen"} nog aantoonbare actie`}
          </strong>
        </div>
        {summary.canRelease ? (
          <p>De vijf actuele besluiten voldoen aan de formele vrijgaveregel.</p>
        ) : (
          <ul>
            {openGates.map((acceptanceGate) => {
              const record = latest.get(acceptanceGate);
              return (
                <li key={acceptanceGate}>
                  <strong>{goLiveAcceptanceGateLabels[acceptanceGate].label}</strong>
                  <span>
                    {record?.decision === "rejected"
                      ? `Afgewezen · ${record.notes || "oorzaak en vervolgactie controleren"}`
                      : "Nog geen actuele goedkeuring met volledig bewijs"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="release-gate-grid">
        {goLiveAcceptanceGates.map((acceptanceGate) => {
          const record = latest.get(acceptanceGate);
          const status = record?.decision ?? "pending";
          return (
            <article key={acceptanceGate} className={status}>
              <span className={`model-group-status ${status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending"}`}>
                {status === "approved" ? "Goedgekeurd" : status === "rejected" ? "Afgewezen" : "Open"}
              </span>
              <h3>{goLiveAcceptanceGateLabels[acceptanceGate].label}</h3>
              <p>{goLiveAcceptanceGateLabels[acceptanceGate].evidenceHint}</p>
              <b>{goLiveAcceptanceGateRequirements[acceptanceGate].length} concrete bewijspunten</b>
              <small>{record ? `${record.ownerName} · ${formatDate(record.recordedAt)}` : "Nog geen besluit vastgelegd"}</small>
              <button className="release-gate-select" type="button" onClick={() => setGate(acceptanceGate)}>
                Open in formulier
              </button>
            </article>
          );
        })}
      </section>

      <section className="release-workspace">
        <form className="release-form" onSubmit={submit}>
          <div className="workspace-card-heading">
            <div><h3>Acceptatiebesluit vastleggen</h3><p>Een registratie documenteert bewijs; zij voert de externe test niet zelf uit.</p></div>
          </div>
          <label>
            <span>Go-livepoort</span>
            <select value={gate} onChange={(event) => setGate(event.target.value as GoLiveAcceptanceGate)}>
              {goLiveAcceptanceGates.map((acceptanceGate) => (
                <option key={acceptanceGate} value={acceptanceGate}>
                  {goLiveAcceptanceGateLabels[acceptanceGate].label}
                </option>
              ))}
            </select>
            <small>{goLiveAcceptanceGateLabels[gate].evidenceHint}</small>
          </label>
          <section className="release-requirements">
            <span>Poortspecifiek bewijs</span>
            <strong>Controleer deze punten in het echte acceptatierapport</strong>
            <ol>
              {goLiveAcceptanceGateRequirements[gate].map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ol>
          </section>
          <label>
            <span>Verantwoordelijke eigenaar</span>
            <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Naam van systeemeigenaar of procesverantwoordelijke" required />
          </label>
          <div className="release-field-pair">
            <label><span>Bewijsreferentie</span><input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Ticket, rapport, providerlog of dossier-ID" /></label>
            <label><span>Bewijsdatum</span><input type="datetime-local" value={evidenceDate} onChange={(event) => setEvidenceDate(event.target.value)} /></label>
          </div>
          <fieldset className="release-checks">
            <legend>Vrijgavecontroles</legend>
            {(Object.keys(checkLabels) as Array<keyof typeof checkLabels>).map((key) => (
              <label key={key}>
                <input type="checkbox" checked={checks[key]} onChange={() => setChecks((current) => ({ ...current, [key]: !current[key] }))} />
                <span>{checkLabels[key]}</span>
              </label>
            ))}
          </fieldset>
          <label>
            <span>Besluit</span>
            <select value={decision} onChange={(event) => setDecision(event.target.value as GoLiveAcceptanceDecision)}>
              <option value="pending">In behandeling · geen vrijgave</option>
              <option value="approved">Goedgekeurd</option>
              <option value="rejected">Afgewezen</option>
            </select>
          </label>
          <label>
            <span>Notities, afwijking en vervolgactie</span>
            <textarea rows={4} maxLength={1200} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button className="primary-button" type="submit" disabled={submitting || (sync.mode === "central" && sync.status !== "ready")}>
            {submitting ? "Besluit opslaan…" : "Acceptatiebesluit vastleggen"}
          </button>
          {message && <div className={message.includes("goedgekeurd") ? "policy-saved" : message.includes("vastgelegd") ? "approval-note" : "form-error"} role="status">{message}</div>}
          <small>Beoordeling door {actorName}. Alleen alle vijf actuele goedkeuringen maken formele vrijgave mogelijk.</small>
        </form>

        <section className="release-history">
          <div className="workspace-card-heading">
            <div><h3>Besluithistorie</h3><p>Ieder nieuw besluit vervangt alleen de actuele status van dezelfde poort.</p></div>
          </div>
          {sortedRecords.length === 0 ? (
            <div className="empty">Nog geen acceptatiebesluiten geregistreerd.</div>
          ) : (
            <div className="table-wrap">
              <table className="operations-table">
                <thead><tr><th>Moment</th><th>Poort</th><th>Eigenaar</th><th>Bewijs</th><th>Besluit</th><th>Beoordelaar</th></tr></thead>
                <tbody>
                  {sortedRecords.map((record) => (
                    <tr key={record.id}>
                      <td><strong>{formatDate(record.recordedAt)}</strong></td>
                      <td><strong>{goLiveAcceptanceGateLabels[record.gate].label}</strong><span>{record.notes || "Geen bijzonderheden"}</span></td>
                      <td>{record.ownerName}</td>
                      <td><strong>{record.evidenceReference || "Nog niet toegevoegd"}</strong><span>{record.evidenceDate ? formatDate(record.evidenceDate) : "Geen bewijsdatum"}</span></td>
                      <td><span className={`model-group-status ${record.decision === "approved" ? "approved" : record.decision === "rejected" ? "rejected" : "pending"}`}>{record.decision === "approved" ? "Goedgekeurd" : record.decision === "rejected" ? "Afgewezen" : "Open"}</span></td>
                      <td>{record.reviewedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
