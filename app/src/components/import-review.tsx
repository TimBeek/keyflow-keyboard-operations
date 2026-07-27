"use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "error" | "warning" | "review";

type ReviewIssue = {
  issueId: string;
  severity: Severity;
  field: string;
  code: string;
  message: string;
  resolved: boolean;
  resolutionNote: string | null;
  resolvedAt: string | null;
  sourceRow: number | null;
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
    batchId === "demo" ? createDemoReview() : null,
  );
  const [filter, setFilter] = useState<Filter>("open");
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [note, setNote] = useState("");
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
    setSaving(true);
    setError("");

    try {
      if (data.batchId !== "demo") {
        const response = await fetch(
          `/api/imports/inventory/${data.batchId}/issues/${issue.issueId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resolved: true, resolutionNote: note.trim() }),
          },
        );
        const body = await response.json() as { message?: string };
        if (!response.ok) throw new Error(body.message ?? "De bevinding kon niet worden afgehandeld.");
      }

      setData((current) => current ? resolveLocally(current, issue.issueId, note.trim()) : current);
      setActiveIssueId(null);
      setNote("");
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
                      {issue.resolutionNote && <div className="resolution-note"><b>Toelichting:</b> {issue.resolutionNote}</div>}
                      {activeIssueId === issue.issueId && (
                        <div className="resolution-form">
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
                            <button className="secondary-button" onClick={() => { setActiveIssueId(null); setNote(""); }}>Annuleren</button>
                            <button className="primary-button" disabled={saving || note.trim().length < 3} onClick={() => resolveIssue(issue)}>
                              {saving ? "Opslaan…" : "Afhandelen"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {!issue.resolved && activeIssueId !== issue.issueId && (
                      <button className="issue-action" onClick={() => { setActiveIssueId(issue.issueId); setNote(""); setError(""); }}>
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

function resolveLocally(data: ReviewData, issueId: string, resolutionNote: string): ReviewData {
  const issues = data.issues.map((issue) => issue.issueId === issueId
    ? { ...issue, resolved: true, resolutionNote, resolvedAt: new Date().toISOString() }
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

function severityLabel(severity: Severity) {
  if (severity === "error") return "Fout";
  if (severity === "review") return "Dubbel?";
  return "Let op";
}

function fieldLabel(field: string) {
  return ({
    quantity: "Aantal",
    sku: "Artikelnummer",
    layout: "Layout",
    linkedModels: "Compatibiliteit",
    model: "Model",
  } as Record<string, string>)[field] ?? field;
}

function createDemoReview(): ReviewData {
  const errors: ReviewIssue[] = [
    demoIssue("error", 32, "sku", "INVALID_SKU", "Ontbrekend of afwijkend artikelnummer: ,,,,,,,,,,", "HP ProBook 640", ""),
    demoIssue("error", 65, "sku", "INVALID_SKU", "Ontbrekend of afwijkend artikelnummer: leeg", "Lenovo ThinkPad T480", ""),
    demoIssue("error", 150, "sku", "INVALID_SKU", "Ontbrekend of afwijkend artikelnummer: leeg", "Dell Latitude 5410", ""),
  ];
  const warningRows = [10, 24, 27, 28, 43, 45, 56, 57, 71, 79, 84, 98, 106, 108, 110, 117, 118, 121, 125, 128, 132, 135, 136, 137, 139, 140, 142, 145, 148, 149, 150];
  const warnings = warningRows.map((row) =>
    demoIssue("warning", row, "linkedModels", "MISSING_COMPATIBILITY", "Compatibiliteit ontbreekt of bevat een placeholder.", `Laptopmodel rij ${row}`, `NB10${row}E1NL`),
  );
  const reviews = [
    [38, "sku", "DUPLICATE_SKU", "Dubbel artikelnummer NB10100E1NL op rijen 38 en 149."],
    [94, "sku", "DUPLICATE_SKU", "Dubbel artikelnummer NB10021E1NL op rijen 94 en 107."],
    [112, "sku", "DUPLICATE_SKU", "Dubbel artikelnummer NB10190E1NL op rijen 112 en 135."],
    [10, "model", "DUPLICATE_MODEL", "Dubbele modelnaam na normalisatie op rijen 10 en 77."],
    [20, "model", "DUPLICATE_MODEL", "Dubbele modelnaam na normalisatie op rijen 20 en 146."],
    [38, "model", "DUPLICATE_MODEL", "Dubbele modelnaam na normalisatie op rijen 38 en 149."],
    [43, "model", "DUPLICATE_MODEL", "Dubbele modelnaam na normalisatie op rijen 43 en 148."],
    [109, "model", "DUPLICATE_MODEL", "Dubbele modelnaam na normalisatie op rijen 109 en 141."],
    [114, "model", "DUPLICATE_MODEL", "Dubbele modelnaam na normalisatie op rijen 114 en 150."],
  ].map(([row, field, code, message]) =>
    demoIssue("review", Number(row), String(field), String(code), String(message), `Laptopmodel rij ${row}`, field === "sku" ? String(message).split(" ")[2] : `NB10${row}E1NL`),
  );

  return {
    batchId: "demo",
    fileName: "Toetsenbordstickers voorraad.xlsx · voorbeeldweergave",
    status: "needs_review",
    recordCount: 148,
    totalQuantity: 3218,
    errorCount: errors.length,
    warningCount: warnings.length,
    reviewCount: reviews.length,
    openIssueCount: errors.length + warnings.length + reviews.length,
    issues: [...errors, ...reviews, ...warnings],
  };
}

function demoIssue(
  severity: Severity,
  sourceRow: number,
  field: string,
  code: string,
  message: string,
  model: string,
  sku: string,
): ReviewIssue {
  return {
    issueId: `demo-${severity}-${sourceRow}-${field}`,
    severity,
    field,
    code,
    message,
    resolved: false,
    resolutionNote: null,
    resolvedAt: null,
    sourceRow,
    model,
    quantity: null,
    layout: "QWERTY US",
    sku,
    linkedModels: null,
  };
}
