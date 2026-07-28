"use client";

import { useMemo, useState } from "react";
import {
  latestRecoveryDrill,
  productionReadinessGates,
  productionReadinessSummary,
  recoveryCheckKeys,
  type RecoveryCheckKey,
  type RecoveryDrillInput,
  type RecoveryDrillRecord,
} from "@/domain/production-readiness";

type Props = {
  records: RecoveryDrillRecord[];
  actorName: string;
  onRecord: (input: RecoveryDrillInput) => RecoveryDrillRecord;
};

const checkLabels: Record<RecoveryCheckKey, string> = {
  migrations: "Alle databasemigraties aanwezig",
  sourceSnapshot: "Excel-bronsnapshot en totalen gelijk",
  inventoryBalances: "SKU-balansen en hangmaplocaties gelijk",
  transactionLedger: "Transactielog sluit aan op de voorraad",
  accessControl: "Management- en werknemersrechten gecontroleerd",
};

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ProductionReadinessCenter({ records, actorName, onRecord }: Props) {
  const now = new Date();
  const [backupReference, setBackupReference] = useState("");
  const [targetEnvironment, setTargetEnvironment] =
    useState<RecoveryDrillInput["targetEnvironment"]>("recovery");
  const [startedAt, setStartedAt] = useState(() =>
    localDateTime(new Date(now.getTime() - 60 * 60_000)));
  const [completedAt, setCompletedAt] = useState(() => localDateTime(now));
  const [rpoMinutes, setRpoMinutes] = useState("15");
  const [rtoMinutes, setRtoMinutes] = useState("60");
  const [result, setResult] = useState<RecoveryDrillInput["result"]>("passed");
  const [checks, setChecks] = useState<Record<RecoveryCheckKey, boolean>>({
    migrations: false,
    sourceSnapshot: false,
    inventoryBalances: false,
    transactionLedger: false,
    accessControl: false,
  });
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const gates = useMemo(() => productionReadinessGates(records), [records]);
  const summary = useMemo(() => productionReadinessSummary(records), [records]);
  const latest = useMemo(() => latestRecoveryDrill(records), [records]);
  const recentRecords = useMemo(
    () => [...records]
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .slice(0, 10),
    [records],
  );

  function toggleCheck(key: RecoveryCheckKey) {
    setChecks((current) => ({ ...current, [key]: !current[key] }));
  }

  function submitRecoveryDrill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const record = onRecord({
        backupReference,
        targetEnvironment,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        rpoMinutes: Number(rpoMinutes),
        rtoMinutes: Number(rtoMinutes),
        checks,
        result,
        notes,
      });
      setMessage(
        record.result === "passed"
          ? "Geslaagde herstelproef als controlebewijs vastgelegd."
          : "Mislukte herstelproef vastgelegd; voer de herstelactie en hertest uit.",
      );
      setBackupReference("");
      setNotes("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "De herstelproef kon niet worden vastgelegd.",
      );
    }
  }

  return (
    <div className="operations-tab-content readiness-center">
      <section className="readiness-summary">
        <article>
          <span>Go-livepoorten</span>
          <strong>{summary.ready}/{summary.total}</strong>
          <small>{summary.external} wachten op externe inrichting</small>
        </article>
        <article>
          <span>Interne vervolgactie</span>
          <strong>{summary.actionRequired}</strong>
          <small>door KeyFlow-management uit te voeren</small>
        </article>
        <article className={latest?.result === "failed" ? "attention" : ""}>
          <span>Laatste herstelproef</span>
          <strong>{latest ? (latest.result === "passed" ? "Geslaagd" : "Mislukt") : "Ontbreekt"}</strong>
          <small>{latest ? `RPO ${latest.rpoMinutes} min · RTO ${latest.rtoMinutes} min` : "Nog geen bewijs geregistreerd"}</small>
        </article>
      </section>

      <section className="readiness-gates">
        <div className="workspace-card-heading">
          <div>
            <h3>Productiegereedheid per poort</h3>
            <p>Technische gereedheid en externe organisatiepunten blijven bewust gescheiden.</p>
          </div>
        </div>
        <div className="readiness-gate-grid">
          {gates.map((gate) => (
            <article key={gate.id}>
              <span className={`readiness-status ${gate.status}`}>
                {gate.status === "ready" ? "Gereed" : gate.status === "external" ? "Extern" : "Actie nodig"}
              </span>
              <h4>{gate.label}</h4>
              <p>{gate.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="recovery-drill-grid">
        <form className="recovery-drill-form" onSubmit={submitRecoveryDrill}>
          <div className="workspace-card-heading">
            <div>
              <h3>Registreer uitgevoerde herstelproef</h3>
              <p>Alleen voor een echt uitgevoerde restore naar staging of een geïsoleerde recoveryomgeving.</p>
            </div>
          </div>

          <div className="recovery-warning">
            Dit formulier registreert controlebewijs. Het maakt zelf geen providerback-up en voert geen restore uit.
          </div>

          <label>
            <span>Back-up- of snapshotreferentie</span>
            <input
              value={backupReference}
              onChange={(event) => setBackupReference(event.target.value)}
              placeholder="bijv. azure-backup-2026-07-28"
              required
            />
          </label>
          <label>
            <span>Doelomgeving</span>
            <select
              value={targetEnvironment}
              onChange={(event) => setTargetEnvironment(
                event.target.value as RecoveryDrillInput["targetEnvironment"],
              )}
            >
              <option value="recovery">Geïsoleerde recoveryomgeving</option>
              <option value="staging">Staging</option>
            </select>
          </label>
          <div className="recovery-field-pair">
            <label><span>Start restore</span><input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required /></label>
            <label><span>Controle afgerond</span><input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} required /></label>
          </div>
          <div className="recovery-field-pair">
            <label><span>Gemeten RPO (min)</span><input type="number" min="0" max="43200" value={rpoMinutes} onChange={(event) => setRpoMinutes(event.target.value)} required /></label>
            <label><span>Gemeten RTO (min)</span><input type="number" min="0" max="10080" value={rtoMinutes} onChange={(event) => setRtoMinutes(event.target.value)} required /></label>
          </div>

          <fieldset className="recovery-checks">
            <legend>Integriteitscontroles</legend>
            {recoveryCheckKeys.map((key) => (
              <label key={key}>
                <input type="checkbox" checked={checks[key]} onChange={() => toggleCheck(key)} />
                <span>{checkLabels[key]}</span>
              </label>
            ))}
          </fieldset>

          <label>
            <span>Uitkomst</span>
            <select value={result} onChange={(event) => setResult(event.target.value as RecoveryDrillInput["result"])}>
              <option value="passed">Geslaagd</option>
              <option value="failed">Mislukt</option>
            </select>
          </label>
          <label>
            <span>Notities, oorzaak en vervolgactie</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} maxLength={1000} />
          </label>
          <button className="primary-button" type="submit">Herstelproef vastleggen</button>
          {message && <div className={message.startsWith("Geslaagde") ? "policy-saved" : "form-error"} role="status">{message}</div>}
          <small>Registratie door {actorName}. Een geslaagde status vereist alle vijf controles.</small>
        </form>

        <section className="recovery-history">
          <div className="workspace-card-heading">
            <div><h3>Herstelhistorie</h3><p>De nieuwste proef bepaalt de readiness-status.</p></div>
          </div>
          {recentRecords.length === 0 ? (
            <div className="empty">Nog geen herstelproef geregistreerd.</div>
          ) : (
            <div className="table-wrap">
              <table className="operations-table">
                <thead><tr><th>Moment</th><th>Referentie</th><th>Omgeving</th><th>RPO / RTO</th><th>Uitkomst</th><th>Door</th></tr></thead>
                <tbody>
                  {recentRecords.map((record) => (
                    <tr key={record.id}>
                      <td><strong>{formatDate(record.completedAt)}</strong></td>
                      <td><strong>{record.backupReference}</strong><span>{record.notes || "Geen bijzonderheden"}</span></td>
                      <td>{record.targetEnvironment === "recovery" ? "Recovery" : "Staging"}</td>
                      <td><strong>{record.rpoMinutes} / {record.rtoMinutes} min</strong></td>
                      <td><span className={`model-group-status ${record.result === "passed" ? "approved" : "rejected"}`}>{record.result === "passed" ? "Geslaagd" : "Mislukt"}</span></td>
                      <td>{record.recordedBy}</td>
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
