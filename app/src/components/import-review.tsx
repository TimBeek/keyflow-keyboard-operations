"use client";

import { useEffect, useMemo, useState } from "react";
import {
  InventoryResolutionError,
  validateImportResolution,
} from "@/import/inventory-resolution";

type Severity = "error" | "warning" | "review";
type ResolutionAction = "correct_value" | "keep_separate" | "accept_warning" | "reject_row";

type ReviewIssue = {
  issueId: string;
  severity: Severity;
  field: string;
  code: string;
  message: string;
  resolved: boolean;
  resolutionNote: string | null;
  resolutionAction: ResolutionAction | null;
  correctedValue: string | null;
  resolvedAt: string | null;
  sourceRow: number | null;
  storageNumber?: number | null;
  model: string | null;
  quantity: number | null;
  layout: string | null;
  sku: string | null;
  linkedModels: string | null;
};

type ReviewData = {
  batchId: string;
  fileName: string;
  status: "needs_review" | "ready";
  recordCount: number;
  totalQuantity: number;
  errorCount: number;
  warningCount: number;
  reviewCount: number;
  openIssueCount: number;
  issues: ReviewIssue[];
};

type Props = {
  batchId: string;
  onClose: () => void;
};

type Filter = "open" | "all" | Severity;

export function ImportReviewDialog({ batchId, onClose }: Props) {
  const [data, setData] = useState<ReviewData | null>(() =>
    null,
  );
  const [filter, setFilter] = useState<Filter>("open");
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [resolutionAction, setResolutionAction] = useState<ResolutionAction>("correct_value");
  const [correctedValue, setCorrectedValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(batchId !== "demo");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (batchId === "demo") return;

    const controller = new AbortController();
    fetch(`/api/imports/inventory/${batchId}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as ReviewData & { message?: string };
        if (!response.ok) throw new Error(body.message ?? "De importbeoordeling kon niet worden geladen.");
        setData(body);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "De importbeoordeling kon niet worden geladen.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [batchId]);

  const filteredIssues = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.issues;
    if (filter === "open") return data.issues.filter(({ resolved }) => !resolved);
    return data.issues.filter(({ severity }) => severity === filter);
  }, [data, filter]);

  function close() {
    onClose();
  }

  async function resolveIssue(issue: ReviewIssue) {
    if (!data || note.trim().length < 3) {
      setError("Vul een toelichting van minimaal 3 tekens in.");
      return;
    }
    let validated: ReturnType<typeof validateImportResolution>;
    try {
      validated = validateImportResolution(issue, resolutionAction, correctedValue);
    } catch (validationError) {
      setError(
        validationError instanceof InventoryResolutionError
          ? validationError.message
          : "Controleer de gekozen afhandeling.",
      );
      return;
    }
    setSaving(true);
    setError("");

    try {
      if (data.batchId !== "demo") {
        const response = await fetch(
          `/api/imports/inventory/${data.batchId}/issues/${issue.issueId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resolved: true,
              resolutionNote: note.trim(),
              resolutionAction: validated.action,
              correctedValue: validated.correctedValue ?? undefined,
            }),
          },
        );
        const body = await response.json() as { message?: string };
        if (!response.ok) throw new Error(body.message ?? "De bevinding kon niet worden afgehandeld.");
      }

      setData((current) => current
        ? resolveLocally(
          current,
          issue.issueId,
          note.trim(),
          validated.action,
          validated.correctedValue,
        )
        : current);
      setActiveIssueId(null);
      setNote("");
      setCorrectedValue("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "De bevinding kon niet worden afgehandeld.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">IMPORTBEOORDELING</span>
            <h2 id="review-title">Bevindingen per Excel-regel</h2>
            <p>{data?.fileName ?? "Import wordt geladen…"}</p>
          </div>
          <button className="close-button" onClick={close} aria-label="Sluiten">×</button>
        </header>

        <div className="review-body">
          {loading && <div className="review-loading">Bevindingen laden…</div>}
          {data && (
            <>
              <div className="review-summary">
                <div className={data.status}><span>Status</span><strong>{data.status === "ready" ? "Klaar" : "Beoordeling nodig"}</strong></div>
                <div><span>Openstaand</span><strong>{data.openIssueCount}</strong></div>
                <div className="metric-error"><span>Fouten</span><strong>{data.errorCount}</strong></div>
                <div className="metric-warning"><span>Waarschuwingen</span><strong>{data.warningCount}</strong></div>
                <div className="metric-review"><span>Dubbelen</span><strong>{data.reviewCount}</strong></div>
              </div>

              <div className="review-toolbar">
                <div className="filter-chips" aria-label="Bevindingen filteren">
                  {([
                    ["open", "Openstaand"],
                    ["all", "Alles"],
                    ["error", "Fouten"],
                    ["warning", "Waarschuwingen"],
                    ["review", "Dubbelen"],
                  ] as [Filter, string][]).map(([value, label]) => (
                    <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                      {label}
                    </button>
                  ))}
                </div>
                <span>{filteredIssues.length} getoond</span>
              </div>

              <div className="review-list">
                {filteredIssues.map((issue) => (
                  <article className={`review-issue ${issue.severity} ${issue.resolved ? "resolved" : ""}`} key={issue.issueId}>
                    <span className="severity-mark">{severityLabel(issue.severity)}</span>
                    <div className="issue-main">
                      <div className="issue-heading">
                        <div>
                          <strong>Rij {issue.sourceRow ?? "?"} · {issue.model || "Model ontbreekt"}</strong>
                          <span>{issue.sku || "Geen geldig artikelnummer"} · {issue.layout || "Layout onbekend"}</span>
                        </div>
                        {issue.resolved && <span className="resolved-badge">Afgehandeld</span>}
                      </div>
                      <p>{issue.message}</p>
                      <small>Veld: {fieldLabel(issue.field)} · Code: {issue.code}</small>
                      {issue.resolutionNote && (
                        <div className="resolution-note">
                          <b>{resolutionActionLabel(issue.resolutionAction)}</b>
                          {issue.correctedValue && <span>Nieuwe waarde: {issue.correctedValue}</span>}
                          <span>Toelichting: {issue.resolutionNote}</span>
                        </div>
                      )}
                      {activeIssueId === issue.issueId && (
                        <div className="resolution-form">
                          <label>
                            <span>Afhandelactie</span>
                            <select
                              value={resolutionAction}
                              onChange={(event) => {
                                setResolutionAction(event.target.value as ResolutionAction);
                                setCorrectedValue("");
                              }}
                            >
                              {resolutionOptions(issue).map(([value, label]) => (
                                <option value={value} key={value}>{label}</option>
                              ))}
                            </select>
                          </label>
                          {resolutionAction === "correct_value" && (
                            <label>
                              <span>Gecorrigeerde waarde</span>
                              <input
                                value={correctedValue}
                                onChange={(event) => setCorrectedValue(event.target.value)}
                                maxLength={500}
                                placeholder={correctionPlaceholder(issue)}
                              />
                            </label>
                          )}
                          <label>
                            <span>Toelichting voor auditlog</span>
                            <textarea
                              autoFocus
                              value={note}
                              onChange={(event) => setNote(event.target.value)}
                              maxLength={500}
                              placeholder="Beschrijf de controle en gemaakte keuze…"
                            />
                          </label>
                          <div>
                            <button className="secondary-button" onClick={() => { setActiveIssueId(null); setNote(""); setCorrectedValue(""); }}>Annuleren</button>
                            <button
                              className="primary-button"
                              disabled={
                                saving
                                || note.trim().length < 3
                                || (resolutionAction === "correct_value" && !correctedValue.trim())
                              }
                              onClick={() => resolveIssue(issue)}
                            >
                              {saving ? "Opslaan…" : "Afhandelen"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {!issue.resolved && activeIssueId !== issue.issueId && (
                      <button
                        className="issue-action"
                        onClick={() => {
                          setActiveIssueId(issue.issueId);
                          setResolutionAction(defaultResolutionAction(issue));
                          setCorrectedValue("");
                          setNote("");
                          setError("");
                        }}
                      >
                        Beoordelen
                      </button>
                    )}
                  </article>
                ))}
                {filteredIssues.length === 0 && <div className="review-empty">Geen bevindingen binnen dit filter.</div>}
              </div>
            </>
          )}
          {error && <div className="form-error review-error">{error}</div>}
        </div>

        <footer className="modal-footer review-footer">
          <span>Live voorraad blijft ongewijzigd tijdens beoordeling.</span>
          <button className="primary-button" onClick={close}>Sluiten</button>
        </footer>
      </section>
    </div>
  );
}

function resolveLocally(
  data: ReviewData,
  issueId: string,
  resolutionNote: string,
  resolutionAction: ResolutionAction,
  correctedValue: string | null,
): ReviewData {
  const selectedIssue = data.issues.find((issue) => issue.issueId === issueId);
  const issues = data.issues.map((issue) => (
    issue.issueId === issueId
    || (
      resolutionAction === "reject_row"
      && selectedIssue?.sourceRow !== null
      && issue.sourceRow === selectedIssue?.sourceRow
    )
  )
    ? {
      ...applyDisplayedCorrection(issue, resolutionAction, correctedValue),
      resolved: true,
      resolutionNote,
      resolutionAction,
      correctedValue,
      resolvedAt: new Date().toISOString(),
    }
    : issue);
  const openIssueCount = issues.filter(({ resolved }) => !resolved).length;
  const blockers = issues.filter(({ resolved, severity }) => !resolved && (severity === "error" || severity === "review")).length;
  return {
    ...data,
    issues,
    openIssueCount,
    status: blockers === 0 ? "ready" : "needs_review",
  };
}

function resolutionOptions(issue: ReviewIssue): [ResolutionAction, string][] {
  if (issue.severity === "error") {
    return [["correct_value", "Waarde corrigeren"], ["reject_row", "Rij niet importeren"]];
  }
  if (issue.severity === "review") {
    return [["keep_separate", "Als aparte regel behouden"], ["reject_row", "Rij niet importeren"]];
  }
  return [
    ["accept_warning", "Gecontroleerd en accepteren"],
    ["correct_value", "Waarde aanvullen/corrigeren"],
    ["reject_row", "Rij niet importeren"],
  ];
}

function defaultResolutionAction(issue: ReviewIssue): ResolutionAction {
  if (issue.severity === "error") return "correct_value";
  if (issue.severity === "review") return "keep_separate";
  return "accept_warning";
}

function correctionPlaceholder(issue: ReviewIssue) {
  if (issue.field === "sku") return "Bijvoorbeeld NB10100E1NL";
  if (issue.field === "storageNumber") return "Bijvoorbeeld 75";
  if (issue.field === "quantity") return "Bijvoorbeeld 25";
  if (issue.field === "layout") return "QWERTY US, AZERTY FR of QWERTZ DE";
  if (issue.field === "linkedModels") return "Bijvoorbeeld Latitude 5400, 5410";
  return "Vul de juiste waarde in";
}

function resolutionActionLabel(action: ResolutionAction | null) {
  return ({
    correct_value: "Waarde gecorrigeerd",
    keep_separate: "Als aparte regel behouden",
    accept_warning: "Waarschuwing gecontroleerd",
    reject_row: "Rij uitgesloten",
  } as Record<ResolutionAction, string>)[action ?? "accept_warning"];
}

function applyDisplayedCorrection(
  issue: ReviewIssue,
  action: ResolutionAction,
  correctedValue: string | null,
) {
  if (action !== "correct_value" || !correctedValue) return issue;
  if (issue.field === "sku") return { ...issue, sku: correctedValue };
  if (issue.field === "storageNumber") return { ...issue, storageNumber: Number(correctedValue) };
  if (issue.field === "quantity") return { ...issue, quantity: Number(correctedValue) };
  if (issue.field === "layout") return { ...issue, layout: correctedValue.toUpperCase() };
  if (issue.field === "linkedModels") return { ...issue, linkedModels: correctedValue };
  if (issue.field === "model") return { ...issue, model: correctedValue };
  return issue;
}

function severityLabel(severity: Severity) {
  if (severity === "error") return "Fout";
  if (severity === "review") return "Dubbel?";
  return "Let op";
}

function fieldLabel(field: string) {
  return ({
    quantity: "Aantal",
    storageNumber: "Hangmapnummer",
    sku: "Artikelnummer",
    layout: "Layout",
    linkedModels: "Compatibiliteit",
    model: "Model",
  } as Record<string, string>)[field] ?? field;
}

