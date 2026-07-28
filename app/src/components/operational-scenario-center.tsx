"use client";

import { useMemo, useState } from "react";
import {
  operationalScenarioCategories,
  operationalScenarioCategoryLabels,
  operationalScenarioSummary,
  runOperationalScenarioSuite,
  type OperationalScenarioCategory,
  type OperationalScenarioStatus,
} from "@/domain/operational-scenarios";

type ScenarioFilter = OperationalScenarioCategory | "all";
type StatusFilter = OperationalScenarioStatus | "all";

export function OperationalScenarioCenter({
  actorName,
}: {
  actorName: string;
}) {
  const [results, setResults] = useState(() => runOperationalScenarioSuite());
  const [lastRunAt, setLastRunAt] = useState(() => new Date().toISOString());
  const [categoryFilter, setCategoryFilter] = useState<ScenarioFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const summary = useMemo(() => operationalScenarioSummary(results), [results]);
  const filtered = results.filter(
    (result) =>
      (categoryFilter === "all" || result.category === categoryFilter)
      && (statusFilter === "all" || result.status === statusFilter),
  );

  function rerun() {
    setResults(runOperationalScenarioSuite());
    setLastRunAt(new Date().toISOString());
  }

  function exportReport() {
    const report = {
      format: "keyflow-operational-scenarios",
      version: 1,
      generatedAt: new Date().toISOString(),
      executedAt: lastRunAt,
      executedBy: actorName,
      scope: "deterministic-software-scenarios",
      disclaimer:
        "Dit rapport bewijst softwaregedrag en vervangt geen fysieke werkvloeracceptatie.",
      summary,
      results,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `keyflow-scenariotest-${lastRunAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="operations-tab-content scenario-center">
      <section className="scenario-scope-banner">
        <div>
          <span>SOFTWAREMATIGE SCENARIOPROEF</span>
          <strong>Normale, grens- en foutpaden reproduceerbaar getest</strong>
          <small>
            Laatste uitvoering {formatDateTime(lastRunAt)} door {actorName}
          </small>
        </div>
        <div className="scenario-scope-actions">
          <button className="secondary-button" type="button" onClick={exportReport}>
            JSON-rapport
          </button>
          <button className="primary-button" type="button" onClick={rerun}>
            Opnieuw uitvoeren
          </button>
        </div>
      </section>

      <section className="scenario-summary">
        <article className={summary.failed === 0 ? "approved" : "attention"}>
          <span>Geslaagd</span>
          <strong>{summary.passed}/{summary.total}</strong>
          <small>{summary.automatedPercentage}% softwarematige dekking</small>
        </article>
        <article className={summary.failed > 0 ? "attention" : ""}>
          <span>Mislukt</span>
          <strong>{summary.failed}</strong>
          <small>{summary.blocking} blokkerende afwijkingen</small>
        </article>
        <article>
          <span>Negatieve paden</span>
          <strong>{results.filter(({ risk }) => risk === "blocking").length}</strong>
          <small>moeten veilig stoppen</small>
        </article>
        <article>
          <span>Fysiek bevestigen</span>
          <strong>{summary.externalConfirmationRequired}</strong>
          <small>scenario&apos;s met apparatuur of pasvorm</small>
        </article>
      </section>

      <section className="scenario-separation-note">
        <div>
          <span>BEWIJSGRENS</span>
          <strong>100% hier betekent: alle geautomatiseerde scenario&apos;s slagen</strong>
        </div>
        <p>
          Dit verlaagt het technische risico, maar bewijst niet dat een sticker fysiek
          past, een scanner op jullie domein werkt of werknemers de flow accepteren.
          Die punten blijven zichtbaar gemarkeerd.
        </p>
      </section>

      <section className="scenario-category-grid">
        {operationalScenarioCategories.map((category) => {
          const categoryResults = results.filter(
            (result) => result.category === category,
          );
          const passed = categoryResults.filter(
            ({ status }) => status === "passed",
          ).length;
          return (
            <button
              type="button"
              className={categoryFilter === category ? "active" : ""}
              key={category}
              onClick={() => setCategoryFilter(
                categoryFilter === category ? "all" : category,
              )}
            >
              <span>{operationalScenarioCategoryLabels[category]}</span>
              <strong>{passed}/{categoryResults.length}</strong>
              <small>{categoryFilter === category ? "Filter actief" : "Toon scenario's"}</small>
            </button>
          );
        })}
      </section>

      <section className="scenario-results-panel">
        <div className="scenario-results-heading">
          <div>
            <h3>Scenariomatrix</h3>
            <p>{filtered.length} van {results.length} scenario&apos;s zichtbaar.</p>
          </div>
          <div className="scenario-filters">
            <label>
              <span>Categorie</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(
                  event.target.value as ScenarioFilter,
                )}
              >
                <option value="all">Alle categorieën</option>
                {operationalScenarioCategories.map((category) => (
                  <option value={category} key={category}>
                    {operationalScenarioCategoryLabels[category]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Resultaat</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(
                  event.target.value as StatusFilter,
                )}
              >
                <option value="all">Alles</option>
                <option value="passed">Geslaagd</option>
                <option value="failed">Mislukt</option>
              </select>
            </label>
          </div>
        </div>

        <div className="scenario-result-list">
          {filtered.map((result) => (
            <article
              className={`scenario-result ${result.status} risk-${result.risk}`}
              key={result.id}
            >
              <div className="scenario-result-status">
                <span>{result.id}</span>
                <strong>{result.status === "passed" ? "Geslaagd" : "Mislukt"}</strong>
              </div>
              <div className="scenario-result-main">
                <div className="scenario-result-title">
                  <div>
                    <span>{operationalScenarioCategoryLabels[result.category]}</span>
                    <h4>{result.title}</h4>
                  </div>
                  <div className="scenario-result-badges">
                    <span className={`scenario-risk ${result.risk}`}>
                      {riskLabel(result.risk)}
                    </span>
                    {result.externalConfirmationRequired && (
                      <span className="scenario-external">Fysiek bevestigen</span>
                    )}
                  </div>
                </div>
                <div className="scenario-result-comparison">
                  <div><span>Verwacht</span><strong>{result.expected}</strong></div>
                  <div><span>Werkelijk</span><strong>{result.actual}</strong></div>
                </div>
                <p>{result.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function riskLabel(risk: "normal" | "boundary" | "blocking") {
  return {
    normal: "Normaal pad",
    boundary: "Grensscenario",
    blocking: "Negatief pad",
  }[risk];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
