"use client";

import { useMemo, useState } from "react";
import {
  workfloorMethodIds,
  workfloorMethodLabels,
  workfloorTrialSummary,
  type WorkfloorTrialInput,
  type WorkfloorTrialRecord,
  type WorkfloorTrialResult,
} from "@/domain/workfloor-acceptance";

export type WorkfloorSyncState = {
  mode: "local" | "central";
  status: "local" | "loading" | "saving" | "ready" | "error";
  message: string;
};

type Props = {
  records: WorkfloorTrialRecord[];
  actorName: string;
  sync: WorkfloorSyncState;
  onRefresh: () => void;
  onRecord: (input: WorkfloorTrialInput) => Promise<WorkfloorTrialRecord>;
};

const checkLabels = {
  orderScanWithoutMouse: "Order volledig zonder muis gescand en geladen",
  modelResolution: "Kort modelnummer lost naar het juiste laptopmodel op",
  hangingFileMatched: "Getoond hangmapnummer klopt met de fysieke wagen",
  keyboardGuideReadable: "Nordic-, layout- en E1/E2-gids zijn goed leesbaar",
  deductionAfterVerification: "Voorraad daalt pas na de verplichte controle",
  mismatchStopsDeduction: "Verkeerd of niet-passend vel stopt zonder stille afboeking",
} as const;

const emptyMethods = {
  loose_stickers: false,
  noviply_sheet: false,
  printed_sticker: false,
  direct_reprint: false,
};

const emptyChecks = {
  orderScanWithoutMouse: false,
  modelResolution: false,
  hangingFileMatched: false,
  keyboardGuideReadable: false,
  deductionAfterVerification: false,
  mismatchStopsDeduction: false,
};

export function WorkfloorAcceptanceCenter({
  records,
  actorName,
  sync,
  onRefresh,
  onRecord,
}: Props) {
  const [trialReference, setTrialReference] = useState("");
  const [location, setLocation] = useState("");
  const [deviceType, setDeviceType] = useState<"desktop" | "tablet">("desktop");
  const [deviceName, setDeviceName] = useState("");
  const [scannerName, setScannerName] = useState("");
  const [participants, setParticipants] = useState("1");
  const [ordersTested, setOrdersTested] = useState("0");
  const [startedAt, setStartedAt] = useState("");
  const [completedAt, setCompletedAt] = useState("");
  const [averageHandlingSeconds, setAverageHandlingSeconds] = useState("");
  const [methods, setMethods] = useState(emptyMethods);
  const [errorScenarioTested, setErrorScenarioTested] = useState(false);
  const [checks, setChecks] = useState(emptyChecks);
  const [result, setResult] = useState<WorkfloorTrialResult>("open");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "error">("info");
  const [submitting, setSubmitting] = useState(false);

  const summary = useMemo(() => workfloorTrialSummary(records), [records]);
  const sortedRecords = useMemo(
    () => [...records].sort(
      (left, right) => right.recordedAt.localeCompare(left.recordedAt),
    ),
    [records],
  );
  const checkedMethods = Object.values(methods).filter(Boolean).length;
  const checkedControls = Object.values(checks).filter(Boolean).length;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setMessageTone("info");
    setSubmitting(true);
    try {
      const record = await onRecord({
        trialReference,
        location,
        deviceType,
        deviceName,
        scannerName,
        participants: Number(participants),
        ordersTested: Number(ordersTested),
        startedAt: new Date(startedAt).toISOString(),
        completedAt: completedAt ? new Date(completedAt).toISOString() : null,
        averageHandlingSeconds: averageHandlingSeconds
          ? Number(averageHandlingSeconds)
          : null,
        methods,
        errorScenarioTested,
        checks,
        result,
        evidenceReference,
        notes,
      });
      setMessage(
        record.result === "passed"
          ? "Geslaagde werkvloerproef als bewijs vastgelegd; formele poortgoedkeuring blijft apart."
          : record.result === "failed"
            ? "Mislukte proef met vervolgactie vastgelegd."
            : "Open proefplanning vastgelegd zonder acceptatie.",
      );
      setTrialReference("");
      setCompletedAt("");
      setAverageHandlingSeconds("");
      setOrdersTested("0");
      setMethods(emptyMethods);
      setErrorScenarioTested(false);
      setChecks(emptyChecks);
      setEvidenceReference("");
      setNotes("");
      setResult("open");
    } catch (error) {
      setMessageTone("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "De werkvloerproef kon niet worden opgeslagen.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="operations-tab-content workfloor-trial-center">
      <section className={`release-sync-banner ${sync.status}`}>
        <div>
          <span>{sync.mode === "central" ? "CENTRALE WERKVLOERPROEVEN" : "PILOT WERKVLOERPROEVEN"}</span>
          <strong>{sync.mode === "central" ? "Persoonlijk en auditbaar geregistreerd" : "Lokale voorbereiding zonder productieacceptatie"}</strong>
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
        </div>
      </section>

      <section className="workfloor-trial-summary">
        <article><span>Totaal</span><strong>{summary.total}</strong><small>geregistreerde proeven</small></article>
        <article><span>Open</span><strong>{summary.open}</strong><small>gepland of nog niet afgerond</small></article>
        <article className={summary.failed > 0 ? "attention" : ""}><span>Mislukt</span><strong>{summary.failed}</strong><small>oorzaak en vervolgactie vereist</small></article>
        <article className={summary.passed > 0 ? "approved" : ""}><span>Geslaagd</span><strong>{summary.passed}</strong><small>{summary.latestPassed?.evidenceReference || "nog geen echt bewijs"}</small></article>
      </section>

      <section className="workfloor-trial-safety">
        <div>
          <span>SCHEIDING VAN BEVOEGDHEDEN</span>
          <strong>Een proef levert bewijs, maar keurt de go-livepoort niet goed</strong>
        </div>
        <p>Na een werkelijk geslaagde proef neemt management de bewijsreferentie over in `Vrijgave → Werkvloeracceptatie` en legt daar het afzonderlijke eigenaarsbesluit vast.</p>
      </section>

      <section className="workfloor-trial-layout">
        <form className="workfloor-trial-form" onSubmit={submit}>
          <div className="workspace-card-heading">
            <div><h3>Werkvloerproef registreren</h3><p>Plan een open proef of leg een werkelijk uitgevoerd resultaat vast.</p></div>
          </div>

          <div className="workfloor-trial-fields">
            <label><span>Proefreferentie</span><input value={trialReference} onChange={(event) => setTrialReference(event.target.value)} placeholder="WF-ACCEPT-2026-01" required /></label>
            <label><span>Locatie</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Productievloer / lijn" required /></label>
            <label><span>Apparaattype</span><select value={deviceType} onChange={(event) => setDeviceType(event.target.value as "desktop" | "tablet")}><option value="desktop">Desktop / werkstation</option><option value="tablet">Tablet</option></select></label>
            <label><span>Apparaat</span><input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Werkstation KBD-01" required /></label>
            <label><span>Scanner</span><input value={scannerName} onChange={(event) => setScannerName(event.target.value)} placeholder="Merk en model" required /></label>
            <label><span>Deelnemers</span><input type="number" min="1" max="50" value={participants} onChange={(event) => setParticipants(event.target.value)} required /></label>
            <label><span>Start</span><input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required /></label>
            <label><span>Einde</span><input type="datetime-local" value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} /></label>
            <label><span>Geteste orders</span><input type="number" min="0" max="500" value={ordersTested} onChange={(event) => setOrdersTested(event.target.value)} required /></label>
            <label><span>Gemiddelde doorlooptijd</span><div className="workfloor-time-input"><input type="number" min="1" max="7200" value={averageHandlingSeconds} onChange={(event) => setAverageHandlingSeconds(event.target.value)} placeholder="145" /><b>sec.</b></div></label>
          </div>

          <fieldset className="workfloor-trial-checks">
            <legend>Conversiemethoden · {checkedMethods}/4 uitgevoerd</legend>
            {workfloorMethodIds.map((method) => (
              <label key={method}>
                <input type="checkbox" checked={methods[method]} onChange={() => setMethods((current) => ({ ...current, [method]: !current[method] }))} />
                <span>{workfloorMethodLabels[method]}</span>
              </label>
            ))}
            <label className="critical">
              <input type="checkbox" checked={errorScenarioTested} onChange={() => setErrorScenarioTested((current) => !current)} />
              <span>Minimaal één foutscenario werkelijk uitgevoerd</span>
            </label>
          </fieldset>

          <fieldset className="workfloor-trial-checks">
            <legend>Werkvloercontroles · {checkedControls}/6 bevestigd</legend>
            {(Object.keys(checkLabels) as Array<keyof typeof checkLabels>).map((key) => (
              <label key={key}>
                <input type="checkbox" checked={checks[key]} onChange={() => setChecks((current) => ({ ...current, [key]: !current[key] }))} />
                <span>{checkLabels[key]}</span>
              </label>
            ))}
          </fieldset>

          <div className="workfloor-trial-fields result-fields">
            <label><span>Resultaat</span><select value={result} onChange={(event) => setResult(event.target.value as WorkfloorTrialResult)}><option value="open">Open · geen acceptatie</option><option value="passed">Geslaagd</option><option value="failed">Mislukt</option></select></label>
            <label><span>Bewijsreferentie</span><input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Ticket, rapport, foto- of video-ID" /></label>
          </div>
          <label className="workfloor-notes"><span>Bevindingen, oorzaak en vervolgactie</span><textarea rows={4} maxLength={1200} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={submitting || (sync.mode === "central" && sync.status !== "ready")}>
            {submitting ? "Proef opslaan…" : "Werkvloerproef vastleggen"}
          </button>
          {message && <div className={messageTone === "error" ? "form-error" : "approval-note"} role="status">{message}</div>}
          <small>Registratie door {actorName}. Vink uitsluitend werkelijk uitgevoerde controles aan.</small>
        </form>

        <section className="workfloor-trial-history">
          <div className="workspace-card-heading">
            <div><h3>Proefhistorie</h3><p>Volledige audit per apparaat, scanner, locatie en resultaat.</p></div>
          </div>
          {sortedRecords.length === 0 ? (
            <div className="empty">Nog geen werkvloerproef geregistreerd.</div>
          ) : (
            <div className="table-wrap">
              <table className="operations-table">
                <thead><tr><th>Moment</th><th>Proef</th><th>Apparatuur</th><th>Dekking</th><th>Resultaat</th><th>Registratie</th></tr></thead>
                <tbody>
                  {sortedRecords.map((record) => (
                    <tr key={record.id}>
                      <td><strong>{formatDate(record.recordedAt)}</strong><span>{record.completedAt ? `${formatDate(record.startedAt)} – ${formatDate(record.completedAt)}` : "Nog open"}</span></td>
                      <td><strong>{record.trialReference}</strong><span>{record.location} · {record.participants} deelnemer(s)</span></td>
                      <td><strong>{record.deviceName}</strong><span>{record.scannerName} · {record.deviceType === "tablet" ? "tablet" : "werkstation"}</span></td>
                      <td><strong>{record.ordersTested} orders · {Object.values(record.methods).filter(Boolean).length}/4 methoden</strong><span>{record.averageHandlingSeconds ? `${record.averageHandlingSeconds} sec. gemiddeld` : "Geen doorlooptijd"}</span></td>
                      <td><span className={`model-group-status ${record.result === "passed" ? "approved" : record.result === "failed" ? "rejected" : "pending"}`}>{record.result === "passed" ? "Geslaagd" : record.result === "failed" ? "Mislukt" : "Open"}</span><small>{record.evidenceReference || record.notes || "Geen bewijs"}</small></td>
                      <td><strong>{record.recordedBy}</strong></td>
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
