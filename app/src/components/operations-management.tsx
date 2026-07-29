"use client";

import { useMemo, useRef, useState } from "react";
import { inventoryCatalog } from "@/data/inventory-catalog";
import {
  type StockCountInput,
  type StockCountRecord,
} from "@/domain/cycle-count";
import {
  emptyCompatibilityCheckpoints,
  type CompatibilityCheckpoints,
  type CompatibilityEvidenceInput,
  type CompatibilityEvidenceRecord,
} from "@/domain/compatibility-evidence";
import { inventoryQuantity } from "@/domain/inventory-quantities";
import {
  createModelGroupProposals,
  latestModelGroupDecisions,
  type ModelGroupDecision,
  type ModelGroupEvidence,
  type ModelGroupProposal,
  type ModelGroupReviewInput,
} from "@/domain/model-grouping";
import {
  calculateAbcAnalysis,
  layoutWithCountry,
  type InventoryTransactionEntry,
  type OperationsPolicy,
  type OperationalMethodId,
} from "@/domain/operations";
import {
  stickerVerificationFailureLabel,
  type StickerVerificationReport,
} from "@/domain/sticker-verification";
import {
  ProductionReadinessCenter,
  type ContinuitySyncState,
} from "@/components/production-readiness-center";
import {
  GoLiveAcceptanceCenter,
  type AcceptanceSyncState,
} from "@/components/go-live-acceptance-center";
import {
  WorkfloorAcceptanceCenter,
  type WorkfloorSyncState,
} from "@/components/workfloor-acceptance-center";
import { OperationalScenarioCenter } from "@/components/operational-scenario-center";
import type {
  RecoveryDrillInput,
  RecoveryDrillRecord,
} from "@/domain/production-readiness";
import type {
  GoLiveAcceptanceInput,
  GoLiveAcceptanceRecord,
} from "@/domain/go-live-acceptance";
import type {
  WorkfloorTrialInput,
  WorkfloorTrialRecord,
} from "@/domain/workfloor-acceptance";

type Props = {
  quantities: Record<string, number>;
  transactions: InventoryTransactionEntry[];
  policy: OperationsPolicy;
  verificationReports: StickerVerificationReport[];
  stockCounts: StockCountRecord[];
  modelGroupDecisions: ModelGroupDecision[];
  compatibilityEvidenceRecords: CompatibilityEvidenceRecord[];
  recoveryDrills: RecoveryDrillRecord[];
  goLiveAcceptanceRecords: GoLiveAcceptanceRecord[];
  workfloorTrials: WorkfloorTrialRecord[];
  actorName: string;
  continuitySync: ContinuitySyncState;
  acceptanceSync: AcceptanceSyncState;
  workfloorSync: WorkfloorSyncState;
  onRefreshContinuity: () => void;
  onRefreshAcceptance: () => void;
  onRefreshWorkfloor: () => void;
  onRecordStockCount: (input: StockCountInput) => StockCountRecord;
  onReviewModelGroup: (
    proposal: ModelGroupProposal,
    input: ModelGroupReviewInput,
  ) => ModelGroupDecision;
  onRecordCompatibilityEvidence: (
    input: CompatibilityEvidenceInput,
  ) => CompatibilityEvidenceRecord;
  onRecordRecoveryDrill: (input: RecoveryDrillInput) => Promise<RecoveryDrillRecord>;
  onRecordGoLiveAcceptance: (
    input: GoLiveAcceptanceInput,
  ) => Promise<GoLiveAcceptanceRecord>;
  onRecordWorkfloorTrial: (
    input: WorkfloorTrialInput,
  ) => Promise<WorkfloorTrialRecord>;
  onPolicyChange: (policy: OperationsPolicy) => void;
  persistence: {
    ready: boolean;
    lastSavedAt: string | null;
    message: string;
  };
  onExportBackup: () => void;
  onRestoreBackup: (file: File) => Promise<{ success: boolean; message: string }>;
  onResetPilotData: () => void;
  /** Welke tabbladen tonen. Weglaten = alle (oude gedrag). Eén tabblad verbergt de tabbalk. */
  tabs?: Tab[];
};

type Tab =
  | "abc"
  | "ledger"
  | "counts"
  | "verification"
  | "model_groups"
  | "evidence"
  | "continuity"
  | "release"
  | "workfloor"
  | "scenarios"
  | "policy";

export const allTabs: Tab[] = [
  "abc", "ledger", "counts", "verification", "model_groups",
  "evidence", "continuity", "release", "workfloor", "scenarios", "policy",
];

type ModelGroupFilter = "pending" | "approved" | "rejected" | "all";

const emptyModelGroupEvidence: ModelGroupEvidence = {
  exactVariantConfirmed: false,
  manufacturerPartNumberConfirmed: false,
  photoConfirmed: false,
  dryFitPassed: false,
};

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
  verificationReports,
  stockCounts,
  modelGroupDecisions,
  compatibilityEvidenceRecords,
  recoveryDrills,
  goLiveAcceptanceRecords,
  workfloorTrials,
  actorName,
  continuitySync,
  acceptanceSync,
  workfloorSync,
  onRefreshContinuity,
  onRefreshAcceptance,
  onRefreshWorkfloor,
  onRecordStockCount,
  onReviewModelGroup,
  onRecordCompatibilityEvidence,
  onRecordRecoveryDrill,
  onRecordGoLiveAcceptance,
  onRecordWorkfloorTrial,
  onPolicyChange,
  persistence,
  onExportBackup,
  onRestoreBackup,
  onResetPilotData,
  tabs,
}: Props) {
  const backupInputRef = useRef<HTMLInputElement>(null);
  /**
   * Zonder `tabs` gedraagt dit scherm zich als vanouds (alle tabbladen).
   * De vernieuwde navigatie geeft één tabblad mee, zodat "Hardlopers" en
   * "Layoutgroepen" eigen menu-items zijn in plaats van tabbladen diep
   * weggestopt onder Beheer & analyse.
   */
  const shownTabs = tabs && tabs.length > 0 ? tabs : allTabs;
  const [tab, setTab] = useState<Tab>(shownTabs[0]);
  const [draft, setDraft] = useState(policy);
  const [saved, setSaved] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const [countStorageNumber, setCountStorageNumber] = useState("75");
  const [countedQuantity, setCountedQuantity] = useState("");
  const [countNotes, setCountNotes] = useState("");
  const [countMessage, setCountMessage] = useState("");
  const [modelGroupFilter, setModelGroupFilter] = useState<ModelGroupFilter>("pending");
  const [modelGroupQuery, setModelGroupQuery] = useState("");
  const [selectedModelGroupId, setSelectedModelGroupId] = useState("");
  const [manufacturerPartNumber, setManufacturerPartNumber] = useState("");
  const [photoReference, setPhotoReference] = useState("");
  const [modelGroupNotes, setModelGroupNotes] = useState("");
  const [modelGroupEvidence, setModelGroupEvidence] = useState<ModelGroupEvidence>(
    emptyModelGroupEvidence,
  );
  const [modelGroupMessage, setModelGroupMessage] = useState("");
  // Groepen worden pas getoond nadat je op de knop hebt gedrukt. Zijn er al
  // besluiten genomen, dan is er niets meer te starten en staan ze meteen open.
  const [groupsGenerated, setGroupsGenerated] = useState(modelGroupDecisions.length > 0);
  const [showEvidenceFields, setShowEvidenceFields] = useState(false);
  const [excludedModels, setExcludedModels] = useState<string[]>([]);
  const [addedModels, setAddedModels] = useState<string[]>([]);
  const [modelToAdd, setModelToAdd] = useState("");
  const [evidenceCatalogKey, setEvidenceCatalogKey] = useState("hangmap-075");
  const [evidenceModel, setEvidenceModel] = useState("Dell Latitude 5420");
  const [evidenceStatus, setEvidenceStatus] = useState<CompatibilityEvidenceRecord["status"]>("approved");
  const [evidencePartNumber, setEvidencePartNumber] = useState("");
  const [evidencePhotoReference, setEvidencePhotoReference] = useState("");
  const [evidenceWidthMm, setEvidenceWidthMm] = useState("285");
  const [evidenceHeightMm, setEvidenceHeightMm] = useState("105");
  const [evidenceCheckpoints, setEvidenceCheckpoints] = useState<CompatibilityCheckpoints>(
    emptyCompatibilityCheckpoints,
  );
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [evidenceMessage, setEvidenceMessage] = useState("");

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
    (sum, item) => sum + inventoryQuantity(quantities, item),
    0,
  );
  const mismatchCount = transactions
    .filter((entry) => entry.reasonCode === "fit_mismatch")
    .reduce((sum, entry) => sum + Math.abs(entry.quantityDelta), 0);
  const blockedUnusedCount = verificationReports.filter((report) => report.outcome === "blocked_unused").length;
  const verificationAlertCount = verificationReports.filter((report) => report.outcome !== "passed").length;
  const countDiscrepancies = stockCounts.filter(({ difference }) => difference !== 0).length;
  const selectedCountItem = inventoryCatalog.find(
    ({ storageNumber }) => storageNumber === Number(countStorageNumber),
  ) ?? null;
  const selectedExpectedQuantity = selectedCountItem
    ? inventoryQuantity(quantities, selectedCountItem)
    : null;
  const countDifference = countedQuantity !== "" && selectedExpectedQuantity !== null
    ? Number(countedQuantity) - selectedExpectedQuantity
    : null;
  const recentCounts = [...stockCounts]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 20);
  // Pas groeperen nadat op de knop is gedrukt; daarvoor valt er niets te tonen.
  const modelGroupProposals = useMemo(
    () => (groupsGenerated ? createModelGroupProposals(inventoryCatalog) : []),
    [groupsGenerated],
  );
  // Alle modelnamen die de catalogus kent, zodat toevoegen niet op typfouten stukloopt.
  const modelSuggestions = useMemo(
    () => [...new Set(inventoryCatalog.flatMap((item) => item.modelAliases))].sort(),
    [],
  );
  const latestGroupDecisions = useMemo(
    () => latestModelGroupDecisions(modelGroupDecisions),
    [modelGroupDecisions],
  );
  const modelGroupCounts = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const proposal of modelGroupProposals) {
      const status = latestGroupDecisions.get(proposal.id)?.status ?? "pending";
      counts[status] += 1;
    }
    return counts;
  }, [latestGroupDecisions, modelGroupProposals]);
  const filteredModelGroupProposals = useMemo(() => {
    const normalizedQuery = modelGroupQuery.trim().toLowerCase();
    return modelGroupProposals.filter((proposal) => {
      const status = latestGroupDecisions.get(proposal.id)?.status ?? "pending";
      const matchesStatus = modelGroupFilter === "all" || status === modelGroupFilter;
      const haystack = [
        proposal.proposedName,
        proposal.sku,
        proposal.layout,
        proposal.storageNumber,
        ...proposal.models,
      ].join(" ").toLowerCase();
      return matchesStatus && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [
    latestGroupDecisions,
    modelGroupFilter,
    modelGroupProposals,
    modelGroupQuery,
  ]);
  const selectedModelGroup = filteredModelGroupProposals.find(
    ({ id }) => id === selectedModelGroupId,
  ) ?? filteredModelGroupProposals[0] ?? null;
  const selectedModelGroupDecision = selectedModelGroup
    ? latestGroupDecisions.get(selectedModelGroup.id)
    : undefined;
  const evidenceCatalogItem = inventoryCatalog.find(
    ({ catalogKey }) => catalogKey === evidenceCatalogKey,
  ) ?? null;
  const recentCompatibilityEvidence = [...compatibilityEvidenceRecords]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 25);
  const approvedCompatibilityEvidence = compatibilityEvidenceRecords.filter(
    ({ status }) => status === "approved",
  ).length;
  const rejectedCompatibilityEvidence = compatibilityEvidenceRecords.filter(
    ({ status }) => status === "rejected",
  ).length;

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

  function recordCount() {
    if (!selectedCountItem || countedQuantity === "") {
      setCountMessage("Kies een geldige hangmap en vul de werkelijk getelde voorraad in.");
      return;
    }
    try {
      const record = onRecordStockCount({
        catalogKey: selectedCountItem.catalogKey,
        countedQuantity: Number(countedQuantity),
        notes: countNotes,
      });
      setCountMessage(
        record.difference === 0
          ? `Telling opgeslagen: hangmap ${record.storageNumber} klopt met ${record.countedQuantity} vellen.`
          : `Telling opgeslagen: ${formatDelta(record.difference)} gecorrigeerd, nieuwe voorraad ${record.countedQuantity}.`,
      );
      setCountedQuantity("");
      setCountNotes("");
    } catch (error) {
      setCountMessage(error instanceof Error ? error.message : "De telling kon niet worden opgeslagen.");
    }
  }

  function selectModelGroup(proposal: ModelGroupProposal) {
    const currentDecision = latestGroupDecisions.get(proposal.id);
    setSelectedModelGroupId(proposal.id);
    setManufacturerPartNumber(currentDecision?.manufacturerPartNumber ?? "");
    setPhotoReference(currentDecision?.photoReference ?? "");
    setModelGroupNotes(currentDecision?.notes ?? "");
    setModelGroupEvidence(
      currentDecision?.evidence ?? emptyModelGroupEvidence,
    );
    setExcludedModels(currentDecision?.excludedModels ?? []);
    setAddedModels(currentDecision?.addedModels ?? []);
    setModelToAdd("");
    setModelGroupMessage("");
  }

  function clearModelGroupReview() {
    setSelectedModelGroupId("");
    setManufacturerPartNumber("");
    setPhotoReference("");
    setModelGroupNotes("");
    setModelGroupEvidence(emptyModelGroupEvidence);
    setExcludedModels([]);
    setAddedModels([]);
    setModelToAdd("");
    setModelGroupMessage("");
  }

  function addModelToGroup() {
    const model = modelToAdd.trim();
    if (!model) return;
    if (selectedModelGroup?.models.includes(model) || addedModels.includes(model)) {
      setModelGroupMessage("Dit model staat al in de groep.");
      return;
    }
    setAddedModels((current) => [...current, model]);
    setModelToAdd("");
    setModelGroupMessage("");
  }

  function removeAddedModel(model: string) {
    setAddedModels((current) => current.filter((name) => name !== model));
    setModelGroupMessage("");
  }

  function toggleExcludedModel(model: string) {
    setExcludedModels((current) => (
      current.includes(model)
        ? current.filter((name) => name !== model)
        : [...current, model]
    ));
    setModelGroupMessage("");
  }

  function updateModelGroupEvidence(
    key: keyof ModelGroupEvidence,
    checked: boolean,
  ) {
    setModelGroupEvidence((current) => ({ ...current, [key]: checked }));
    setModelGroupMessage("");
  }

  function reviewModelGroup(status: ModelGroupReviewInput["status"]) {
    if (!selectedModelGroup) {
      setModelGroupMessage("Kies eerst een modelgroepvoorstel.");
      return;
    }
    try {
      const decision = onReviewModelGroup(selectedModelGroup, {
        status,
        manufacturerPartNumber,
        photoReference,
        notes: modelGroupNotes,
        evidence: modelGroupEvidence,
        excludedModels,
        addedModels,
      });
      setModelGroupMessage(
        decision.status === "approved"
          ? "Groep goedgekeurd. Bewijs kun je hier later alsnog toevoegen."
          : "Groep afgewezen.",
      );
    } catch (error) {
      setModelGroupMessage(
        error instanceof Error
          ? error.message
          : "De beoordeling kon niet worden opgeslagen.",
      );
    }
  }

  function selectEvidenceCatalogItem(catalogKey: string) {
    const item = inventoryCatalog.find((candidate) => candidate.catalogKey === catalogKey);
    setEvidenceCatalogKey(catalogKey);
    setEvidenceModel(item?.modelAliases[0] ?? "");
    setEvidenceMessage("");
  }

  function updateEvidenceCheckpoint(
    key: keyof CompatibilityCheckpoints,
    checked: boolean,
  ) {
    setEvidenceCheckpoints((current) => ({ ...current, [key]: checked }));
    setEvidenceMessage("");
  }

  function recordCompatibilityEvidence() {
    if (!evidenceCatalogItem) {
      setEvidenceMessage("Kies eerst een geldige hangmap.");
      return;
    }
    try {
      const record = onRecordCompatibilityEvidence({
        catalogKey: evidenceCatalogItem.catalogKey,
        model: evidenceModel,
        status: evidenceStatus,
        manufacturerPartNumber: evidencePartNumber,
        photoReference: evidencePhotoReference,
        keyboardWidthMm: Number(evidenceWidthMm),
        keyboardHeightMm: Number(evidenceHeightMm),
        checkpoints: evidenceCheckpoints,
        notes: evidenceNotes,
      });
      setEvidenceMessage(
        record.status === "approved"
          ? `Compatibiliteitsbewijs goedgekeurd voor ${record.model} en ${record.sku}.`
          : `Afwijzing opgeslagen: werknemers krijgen voor ${record.model} geen oud Noviply-advies met ${record.sku}.`,
      );
      setEvidencePartNumber("");
      setEvidencePhotoReference("");
      setEvidenceCheckpoints(emptyCompatibilityCheckpoints);
      setEvidenceNotes("");
    } catch (error) {
      setEvidenceMessage(
        error instanceof Error
          ? error.message
          : "Het compatibiliteitsbewijs kon niet worden opgeslagen.",
      );
    }
  }

  const tabMeta: Record<Tab, { label: string; count?: () => number }> = {
    abc: { label: "ABC & hardlopers" },
    ledger: { label: "Boekingen" },
    counts: { label: "Voorraad tellen" },
    verification: { label: "Hangmapcontroles" },
    model_groups: { label: "AI-modelgroepen", count: () => modelGroupCounts.pending },
    evidence: { label: "Bewijsbibliotheek", count: () => compatibilityEvidenceRecords.length },
    continuity: { label: "Continuïteit", count: () => recoveryDrills.length },
    release: { label: "Vrijgave", count: () => goLiveAcceptanceRecords.length },
    workfloor: { label: "Werkvloerproef", count: () => workfloorTrials.length },
    scenarios: { label: "Scenariotest", count: () => 29 },
    policy: { label: "Configuratie" },
  };

  /**
   * Bij één tabblad is dit scherm een eigen menu-bestemming met een eigen
   * paginatitel. De generieke kop en de voorraad-KPI's zouden die dan
   * tegenspreken, dus die tonen we alleen in de volledige beheerweergave.
   */
  const singleTab = shownTabs.length === 1;
  const showStockStats = !singleTab || shownTabs[0] === "abc";

  return (
    <div className="workspace-view operations-workspace">
      {showStockStats && (
        <section className="workspace-stats">
          <article><span>Actuele catalogusvoorraad</span><strong>{currentStock}</strong><small>vellen per fysieke hangmap</small></article>
          <article><span>Uitgeboekt</span><strong>{issued}</strong><small>12-wekenbasis + live sessie</small></article>
          <article><span>Ingeboekt</span><strong>{received}</strong><small>leveringen en correcties</small></article>
          <article className={mismatchCount + blockedUnusedCount > 0 ? "attention" : ""}><span>Controle-afwijkingen</span><strong>{verificationAlertCount}</strong><small>{mismatchCount} uitval · {blockedUnusedCount} zonder afboeking</small></article>
        </section>
      )}

      <section className="panel operations-panel">
        {!singleTab && (
          <div className="order-heading">
            <div>
              <span className="workspace-kicker">OPERATIONEEL BEHEER</span>
              <h2>Voorraadbewegingen en conversiebeleid</h2>
              <p>Beheer het werknemersadvies en stuur op werkelijk in- en uitgaand gebruik.</p>
            </div>
            <span className="data-badge">12 weken voorbeelddata + sessieboekingen</span>
          </div>
        )}

        {shownTabs.length > 1 && (
          <div className="operations-tabs" role="tablist" aria-label="Operationeel beheer">
            {shownTabs.map((id) => {
              const meta = tabMeta[id];
              const count = meta.count?.();
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? "active" : ""}
                  onClick={() => setTab(id)}
                >
                  {meta.label}
                  {count ? <span className="tab-count">{count}</span> : null}
                </button>
              );
            })}
          </div>
        )}

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
                    <tr key={row.catalogKey}>
                      <td><span className={`abc-pill class-${row.abcClass.toLowerCase()}`}>{row.abcClass}</span><small>{row.velocity}</small></td>
                      <td><strong>{row.sku || `Hangmap ${row.storageNumber}`}</strong><span>{row.model} · {row.layout}</span></td>
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

        {tab === "counts" && (
          <div className="operations-tab-content count-workspace">
            <section className="count-entry-card">
              <div className="workspace-card-heading">
                <div>
                  <h3>Cycle count per hangmap</h3>
                  <p>Tel de fysieke vellen zonder het Excel-aantal eerst over te nemen.</p>
                </div>
                <span>
                  {stockCounts.length} {stockCounts.length === 1 ? "telling" : "tellingen"}
                  {" · "}
                  {countDiscrepancies} {countDiscrepancies === 1 ? "verschil" : "verschillen"}
                </span>
              </div>
              <div className="count-entry-grid">
                <label>
                  <span>Hangmapnummer</span>
                  <input
                    list="count-storage-numbers"
                    inputMode="numeric"
                    value={countStorageNumber}
                    onChange={(event) => {
                      setCountStorageNumber(event.target.value.replace(/\D/g, "").slice(0, 3));
                      setCountedQuantity("");
                      setCountNotes("");
                      setCountMessage("");
                    }}
                    placeholder="Bijvoorbeeld 75"
                  />
                  <datalist id="count-storage-numbers">
                    {inventoryCatalog.map((item) => (
                      <option key={item.catalogKey} value={item.storageNumber}>
                        {item.model} · {item.sku || "SKU ontbreekt"}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Werkelijk geteld</span>
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    value={countedQuantity}
                    onChange={(event) => {
                      setCountedQuantity(event.target.value);
                      setCountMessage("");
                    }}
                    placeholder="Niet vooraf ingevuld"
                  />
                </label>
              </div>
              {selectedCountItem ? (
                <div className="count-reference-card">
                  <div><span>Locatie</span><strong>Hangmap {selectedCountItem.storageNumber}</strong></div>
                  <div><span>Model</span><strong>{selectedCountItem.model}</strong></div>
                  <div><span>Artikel</span><strong>{selectedCountItem.sku || "Ontbreekt · bron geblokkeerd"}</strong></div>
                  <div><span>Systeemvoorraad</span><strong>{selectedExpectedQuantity}</strong></div>
                </div>
              ) : (
                <div className="form-error">Dit hangmapnummer bestaat niet in de catalogus.</div>
              )}
              {selectedCountItem?.dataQuality === "blocked" && (
                <div className="count-source-warning">
                  <strong>Bronregel is operationeel geblokkeerd</strong>
                  <span>Fysiek tellen mag wel per locatie. Uitgifte of ontvangst blijft geblokkeerd totdat management het artikelnummer heeft opgelost.</span>
                </div>
              )}
              <label className="count-notes">
                <span>Toelichting bij verschil</span>
                <textarea
                  value={countNotes}
                  onChange={(event) => {
                    setCountNotes(event.target.value);
                    setCountMessage("");
                  }}
                  maxLength={500}
                  placeholder="Verplicht bij een tekort of overschot…"
                />
              </label>
              <div className="count-confirmation">
                <div>
                  <span>Verwacht verschil</span>
                  <strong className={countDifference === null || countDifference === 0 ? "" : countDifference < 0 ? "movement-out" : "movement-in"}>
                    {countDifference === null ? "Nog tellen" : formatDelta(countDifference)}
                  </strong>
                  <small>Een verschil maakt automatisch een herleidbare correctieboeking.</small>
                </div>
                <button className="primary-button" type="button" onClick={recordCount}>Telling vastleggen</button>
              </div>
              {countMessage && <div className={countMessage.startsWith("Telling opgeslagen") ? "policy-saved" : "form-error"}>{countMessage}</div>}
            </section>

            <section className="count-history">
              <div className="workspace-card-heading"><div><h3>Recente tellingen</h3><p>Ook kloppende tellingen blijven als controlebewijs bewaard.</p></div></div>
              <div className="table-wrap">
                <table className="operations-table">
                  <thead><tr><th>Moment</th><th>Hangmap / artikel</th><th>Systeem</th><th>Geteld</th><th>Verschil</th><th>Toelichting</th></tr></thead>
                  <tbody>
                    {recentCounts.map((record) => (
                      <tr key={record.id}>
                        <td><strong>{formatDate(record.occurredAt)}</strong><span>{record.actor}</span></td>
                        <td><strong>Nr. {record.storageNumber}</strong><span>{record.sku || record.model}</span></td>
                        <td><strong>{record.expectedQuantity}</strong></td>
                        <td><strong>{record.countedQuantity}</strong></td>
                        <td><b className={record.difference < 0 ? "movement-out" : record.difference > 0 ? "movement-in" : ""}>{formatDelta(record.difference)}</b></td>
                        <td><strong>{record.notes || "Voorraad klopt"}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentCounts.length === 0 && <div className="empty">Nog geen fysieke hangmaptelling geregistreerd.</div>}
              </div>
            </section>
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

        {tab === "verification" && (
          <div className="operations-tab-content">
            <div className="verification-summary">
              <article><span>Controles akkoord</span><strong>{verificationReports.filter((report) => report.outcome === "passed").length}</strong><small>locatie, SKU, layout, E1/E2 en positionering</small></article>
              <article><span>Gestopt zonder afboeken</span><strong>{blockedUnusedCount}</strong><small>vel bleef bruikbaar</small></article>
              <article><span>Uitval na controle</span><strong>{verificationReports.filter((report) => report.outcome === "scrapped").length}</strong><small>apart van normaal verbruik geboekt</small></article>
            </div>
            <div className="table-wrap">
              <table className="operations-table verification-table">
                <thead><tr><th>Moment / order</th><th>Hangmap</th><th>Sticker / laptop</th><th>Controle-uitkomst</th><th>Medewerker</th></tr></thead>
                <tbody>
                  {[...verificationReports].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 30).map((report) => (
                    <tr key={report.id}>
                      <td><strong>{formatDate(report.occurredAt)}</strong><span>{report.orderReference}</span></td>
                      <td><strong className="storage-number">Nr. {report.storageNumber}</strong><span>Hangmappenwagen</span></td>
                      <td><strong>{report.sku} · {report.variant}</strong><span>{report.model} · {report.targetLayout}</span></td>
                      <td><span className={`verification-outcome ${report.outcome}`}>{verificationOutcomeLabel(report.outcome)}</span><small>{report.outcome === "passed" ? "Alle vijf punten bevestigd" : stickerVerificationFailureLabel(report.failureReason)}</small></td>
                      <td><strong>{report.actor}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {verificationReports.length === 0 && <div className="empty">Nog geen hangmapcontroles in deze pilot. Nieuwe controles verschijnen hier automatisch.</div>}
            </div>
          </div>
        )}

        {tab === "model_groups" && (
          <div className="operations-tab-content model-groups-workspace">
            {!groupsGenerated && (
              <section className="model-group-start">
                <h3>Layoutgroepen genereren</h3>
                <p>
                  KeyFlow zoekt uit welke laptopmodellen dezelfde sticker kunnen gebruiken,
                  op basis van gedeelde SKU&apos;s, layouts en E1/E2-varianten uit je eigen voorraad.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setGroupsGenerated(true)}
                >
                  Genereer layoutgroepen
                </button>
                <small>{inventoryCatalog.length} hangmappen worden vergeleken.</small>
              </section>
            )}

            {groupsGenerated && (
            <section className="model-group-intro">
              <div>
                <h3>Voorgestelde layoutgroepen</h3>
                <p>
                  Elke groep is een set modellen die dezelfde sticker kan gebruiken.
                  Keur goed of wijs af; bewijs vastleggen mag daarna.
                </p>
              </div>
              <div className="model-group-summary" aria-label="Status layoutgroepen">
                <button
                  className={modelGroupFilter === "pending" ? "active pending" : ""}
                  onClick={() => {
                    setModelGroupFilter("pending");
                    clearModelGroupReview();
                  }}
                >
                  <span>Te beoordelen</span><strong>{modelGroupCounts.pending}</strong>
                </button>
                <button
                  className={modelGroupFilter === "approved" ? "active approved" : ""}
                  onClick={() => {
                    setModelGroupFilter("approved");
                    clearModelGroupReview();
                  }}
                >
                  <span>Goedgekeurd</span><strong>{modelGroupCounts.approved}</strong>
                </button>
                <button
                  className={modelGroupFilter === "rejected" ? "active rejected" : ""}
                  onClick={() => {
                    setModelGroupFilter("rejected");
                    clearModelGroupReview();
                  }}
                >
                  <span>Afgewezen</span><strong>{modelGroupCounts.rejected}</strong>
                </button>
              </div>
            </section>
            )}

            {groupsGenerated && (
            <div className="model-group-toolbar">
              <label>
                <span className="sr-only">Modelgroepvoorstellen zoeken</span>
                <input
                  value={modelGroupQuery}
                  onChange={(event) => {
                    setModelGroupQuery(event.target.value);
                    clearModelGroupReview();
                  }}
                  placeholder="Zoek model, SKU of hangmapnummer…"
                />
              </label>
              <button
                className={modelGroupFilter === "all" ? "active" : ""}
                onClick={() => {
                  setModelGroupFilter("all");
                  clearModelGroupReview();
                }}
              >
                Alle voorstellen
              </button>
              <span>{filteredModelGroupProposals.length} zichtbaar</span>
              <button
                className="model-group-regenerate"
                type="button"
                onClick={() => {
                  clearModelGroupReview();
                  setGroupsGenerated(false);
                }}
              >
                Opnieuw genereren
              </button>
            </div>
            )}

            {groupsGenerated && (
            <div className="model-group-review-layout">
              <section className="model-group-queue" aria-label="Modelgroepvoorstellen">
                {filteredModelGroupProposals.slice(0, 80).map((proposal) => {
                  const decision = latestGroupDecisions.get(proposal.id);
                  const status = decision?.status ?? "pending";
                  return (
                    <button
                      className={selectedModelGroup?.id === proposal.id ? "selected" : ""}
                      key={proposal.id}
                      onClick={() => selectModelGroup(proposal)}
                    >
                      <span className={`model-group-status ${status}`}>
                        {modelGroupStatusLabel(status)}
                      </span>
                      <strong>{proposal.proposedName}</strong>
                      <small>
                        {proposal.models.length} modellen · hangmap {proposal.storageNumber}
                      </small>
                      <span className="model-group-score">
                        Bronmatch {proposal.confidence}%
                        {proposal.conflictingModels.length > 0
                          ? ` · ${proposal.conflictingModels.length} conflict${proposal.conflictingModels.length === 1 ? "" : "en"}`
                          : " · geen bronconflict"}
                      </span>
                    </button>
                  );
                })}
                {filteredModelGroupProposals.length === 0 && (
                  <div className="empty">
                    Geen modelgroepvoorstellen binnen dit filter.
                  </div>
                )}
              </section>

              {selectedModelGroup ? (
                <section className="model-group-review">
                  <div className="model-group-review-heading">
                    <div>
                      <span className={`model-group-status ${selectedModelGroupDecision?.status ?? "pending"}`}>
                        {modelGroupStatusLabel(selectedModelGroupDecision?.status ?? "pending")}
                      </span>
                      <h3>{selectedModelGroup.proposedName}</h3>
                      <p>
                        {selectedModelGroup.sku} · {layoutWithCountry(selectedModelGroup.layout, selectedModelGroup.sku)} · {selectedModelGroup.variant} · hangmap {selectedModelGroup.storageNumber}
                      </p>
                    </div>
                    <strong>{selectedModelGroup.confidence}%</strong>
                  </div>

                  <div className="model-group-evidence-grid">
                    <div>
                      <span>
                        Modellen in deze groep
                        {excludedModels.length > 0 && ` · ${excludedModels.length} eruit`}
                      </span>
                      <ul className="model-group-models">
                        {selectedModelGroup.models.map((model) => {
                          const removed = excludedModels.includes(model);
                          return (
                            <li key={model} className={removed ? "removed" : ""}>
                              <span>{model}</span>
                              <button
                                type="button"
                                onClick={() => toggleExcludedModel(model)}
                                aria-label={removed
                                  ? `${model} terugzetten in de groep`
                                  : `${model} uit de groep halen`}
                              >
                                {removed ? "Terug" : "Eruit"}
                              </button>
                            </li>
                          );
                        })}
                        {addedModels.map((model) => (
                          <li key={model} className="added">
                            <span>{model}</span>
                            <button
                              type="button"
                              onClick={() => removeAddedModel(model)}
                              aria-label={`${model} weer weghalen`}
                            >
                              Weghalen
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="model-group-add">
                        <input
                          list="model-group-add-options"
                          value={modelToAdd}
                          onChange={(event) => setModelToAdd(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addModelToGroup();
                          }}
                          placeholder="Model toevoegen…"
                          maxLength={200}
                        />
                        <datalist id="model-group-add-options">
                          {modelSuggestions.map((option) => (
                            <option key={option} value={option} />
                          ))}
                        </datalist>
                        <button type="button" onClick={addModelToGroup}>Toevoegen</button>
                      </div>
                    </div>
                    <div>
                      <span>Herleidbaar bronbewijs</span>
                      <ul>
                        {selectedModelGroup.evidence.map((evidence) => (
                          <li key={evidence}>{evidence}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {selectedModelGroup.conflictingModels.length > 0 && (
                    <div className="model-group-conflict" role="alert">
                      <strong>Bronconflict: niet automatisch vertrouwen</strong>
                      <span>
                        Ook gekoppeld aan een andere SKU/layout:{" "}
                        {selectedModelGroup.conflictingModels.join(", ")}.
                      </span>
                    </div>
                  )}

                  <div className="model-group-actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => reviewModelGroup("approved")}
                    >
                      Groep goedkeuren
                    </button>
                    <button
                      className="danger-ghost-button"
                      type="button"
                      onClick={() => reviewModelGroup("rejected")}
                    >
                      Afwijzen
                    </button>
                  </div>

                  <button
                    className="model-group-evidence-toggle"
                    type="button"
                    onClick={() => setShowEvidenceFields((current) => !current)}
                  >
                    {showEvidenceFields
                      ? "Bewijs verbergen"
                      : "Bewijs vastleggen (optioneel, mag later)"}
                  </button>

                  {showEvidenceFields && (
                  <div className="model-group-evidence-optional">
                  <div className="model-group-required">
                    <strong>Nog vast te leggen</strong>
                    <span>{selectedModelGroup.missingEvidence.join(" · ")}</span>
                  </div>

                  <div className="model-group-fields">
                    <label>
                      <span>Fabrikantonderdeelnummer</span>
                      <input
                        value={manufacturerPartNumber}
                        onChange={(event) => {
                          setManufacturerPartNumber(event.target.value);
                          setModelGroupMessage("");
                        }}
                        maxLength={100}
                        placeholder="Exact nummer van keyboard/assembly"
                      />
                    </label>
                    <label>
                      <span>Foto- of documentreferentie</span>
                      <input
                        value={photoReference}
                        onChange={(event) => {
                          setPhotoReference(event.target.value);
                          setModelGroupMessage("");
                        }}
                        maxLength={200}
                        placeholder="Bijv. FOTO-5420-E1-2026-07"
                      />
                    </label>
                  </div>

                  <fieldset className="model-group-checks">
                    <legend>Fysieke controle</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={modelGroupEvidence.exactVariantConfirmed}
                        onChange={(event) => updateModelGroupEvidence(
                          "exactVariantConfirmed",
                          event.target.checked,
                        )}
                      />
                      <span><strong>Exacte E1/E2 bevestigd</strong><small>Lees de SKU en het fysieke etiket.</small></span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={modelGroupEvidence.manufacturerPartNumberConfirmed}
                        onChange={(event) => updateModelGroupEvidence(
                          "manufacturerPartNumberConfirmed",
                          event.target.checked,
                        )}
                      />
                      <span><strong>Onderdeelnummer gecontroleerd</strong><small>Niet alleen op modelnaam vergelijken.</small></span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={modelGroupEvidence.photoConfirmed}
                        onChange={(event) => updateModelGroupEvidence(
                          "photoConfirmed",
                          event.target.checked,
                        )}
                      />
                      <span><strong>Bovenaanzichtfoto gecontroleerd</strong><small>Enter, Shift, pijlen, functierij en pointing stick.</small></span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={modelGroupEvidence.dryFitPassed}
                        onChange={(event) => updateModelGroupEvidence(
                          "dryFitPassed",
                          event.target.checked,
                        )}
                      />
                      <span><strong>Droge pastest geslaagd</strong><small>Drager en kleeflaag blijven intact.</small></span>
                    </label>
                  </fieldset>

                  <label className="model-group-notes">
                    <span>Notitie</span>
                    <textarea
                      value={modelGroupNotes}
                      onChange={(event) => {
                        setModelGroupNotes(event.target.value);
                        setModelGroupMessage("");
                      }}
                      maxLength={500}
                      placeholder="Bijvoorbeeld waarom deze groep wel of niet klopt…"
                    />
                  </label>
                  </div>
                  )}
                  {modelGroupMessage && (
                    <div
                      className={
                        modelGroupMessage.startsWith("Groep ")
                          ? "policy-saved"
                          : "form-error"
                      }
                      role="status"
                    >
                      {modelGroupMessage}
                    </div>
                  )}
                  {selectedModelGroupDecision && (
                    <small className="model-group-audit">
                      Laatste besluit: {modelGroupStatusLabel(selectedModelGroupDecision.status).toLowerCase()} door{" "}
                      {selectedModelGroupDecision.reviewer} op{" "}
                      {formatDate(selectedModelGroupDecision.decidedAt)}.
                    </small>
                  )}
                </section>
              ) : (
                <section className="model-group-review empty">
                  Kies links een groep om te beoordelen.
                </section>
              )}
            </div>
            )}
          </div>
        )}

        {tab === "evidence" && (
          <div className="operations-tab-content compatibility-evidence-workspace">
            <section className="compatibility-evidence-summary">
              <article>
                <span>Bewijsrecords</span>
                <strong>{compatibilityEvidenceRecords.length}</strong>
                <small>persoonlijk beoordeeld en lokaal bewaard</small>
              </article>
              <article className="approved">
                <span>Goedgekeurd</span>
                <strong>{approvedCompatibilityEvidence}</strong>
                <small>zichtbaar als fysiek bewijs voor werknemers</small>
              </article>
              <article className="rejected">
                <span>Afgewezen</span>
                <strong>{rejectedCompatibilityEvidence}</strong>
                <small>blokkeert oud Noviply-advies voor exact model</small>
              </article>
            </section>

            <section className="compatibility-evidence-entry">
              <div className="workspace-card-heading">
                <div>
                  <span className="workspace-kicker">FYSIEKE PASTEST</span>
                  <h3>Compatibiliteitsbewijs vastleggen</h3>
                  <p>
                    Leg ieder model afzonderlijk vast. Een goedkeuring voor 5420 geldt
                    nooit automatisch voor 5430.
                  </p>
                </div>
                <span>Managementbesluit</span>
              </div>

              <div className="compatibility-evidence-fields">
                <label>
                  <span>Hangmap / artikel</span>
                  <select
                    value={evidenceCatalogKey}
                    onChange={(event) => selectEvidenceCatalogItem(event.target.value)}
                  >
                    {inventoryCatalog
                      .filter(({ dataQuality }) => dataQuality === "ready")
                      .map((item) => (
                        <option value={item.catalogKey} key={item.catalogKey}>
                          Nr. {item.storageNumber} · {item.sku} · {item.layout}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Exact laptopmodel</span>
                  <select
                    value={evidenceModel}
                    onChange={(event) => {
                      setEvidenceModel(event.target.value);
                      setEvidenceMessage("");
                    }}
                  >
                    {(evidenceCatalogItem?.modelAliases ?? []).map((modelName) => (
                      <option value={modelName} key={modelName}>{modelName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Uitkomst droge pastest</span>
                  <select
                    value={evidenceStatus}
                    onChange={(event) => {
                      setEvidenceStatus(event.target.value as CompatibilityEvidenceRecord["status"]);
                      setEvidenceMessage("");
                    }}
                  >
                    <option value="approved">Geslaagd · compatibel</option>
                    <option value="rejected">Afgewezen · niet compatibel</option>
                  </select>
                </label>
                <label>
                  <span>Fabrikantonderdeelnummer</span>
                  <input
                    value={evidencePartNumber}
                    onChange={(event) => {
                      setEvidencePartNumber(event.target.value);
                      setEvidenceMessage("");
                    }}
                    maxLength={100}
                    placeholder="Exact keyboard-, palmrest- of topcasenummer"
                  />
                </label>
                <label>
                  <span>Bovenaanzichtfoto / document</span>
                  <input
                    value={evidencePhotoReference}
                    onChange={(event) => {
                      setEvidencePhotoReference(event.target.value);
                      setEvidenceMessage("");
                    }}
                    maxLength={200}
                    placeholder="Bijv. FOTO-5420-E1-2026-07"
                  />
                </label>
                <label>
                  <span>Keyboardbreedte in mm</span>
                  <input
                    type="number"
                    min="150"
                    max="500"
                    value={evidenceWidthMm}
                    onChange={(event) => {
                      setEvidenceWidthMm(event.target.value);
                      setEvidenceMessage("");
                    }}
                  />
                </label>
                <label>
                  <span>Keyboardhoogte in mm</span>
                  <input
                    type="number"
                    min="50"
                    max="250"
                    value={evidenceHeightMm}
                    onChange={(event) => {
                      setEvidenceHeightMm(event.target.value);
                      setEvidenceMessage("");
                    }}
                  />
                </label>
              </div>

              {evidenceCatalogItem && (
                <div className="compatibility-source-reference">
                  <div><span>Hangmap</span><strong>{evidenceCatalogItem.storageNumber}</strong></div>
                  <div><span>SKU</span><strong>{evidenceCatalogItem.sku}</strong></div>
                  <div><span>Variant</span><strong>{evidenceCatalogItem.sku.match(/E\d+/i)?.[0] ?? "Onbekend"}</strong></div>
                  <div><span>Layout</span><strong>{evidenceCatalogItem.layout}</strong></div>
                </div>
              )}

              <fieldset className="compatibility-checkpoints">
                <legend>Vijf fysieke controlepunten</legend>
                {([
                  ["enterShape", "Enter-vorm", "Vorm, hoogte en uitsparing komen exact overeen."],
                  ["shiftKeys", "Shift-toetsen", "Beide breedtes en omliggende toetsen zijn gelijk."],
                  ["arrowKeys", "Pijltoetsen", "Cluster, hoogte en tussenruimte passen."],
                  ["functionRow", "Functierij", "Aantal, maat en onderlinge afstand kloppen."],
                  ["pointingStickAndNumpad", "Pointing stick / numpad", "Alle uitsparingen en modelopties zijn gecontroleerd."],
                ] as const).map(([key, label, help]) => (
                  <label className={evidenceCheckpoints[key] ? "checked" : ""} key={key}>
                    <input
                      type="checkbox"
                      checked={evidenceCheckpoints[key]}
                      onChange={(event) => updateEvidenceCheckpoint(key, event.target.checked)}
                    />
                    <span><strong>{label}</strong><small>{help}</small></span>
                  </label>
                ))}
              </fieldset>

              <label className="compatibility-evidence-notes">
                <span>Testnotitie / reden van afwijzing</span>
                <textarea
                  value={evidenceNotes}
                  onChange={(event) => {
                    setEvidenceNotes(event.target.value);
                    setEvidenceMessage("");
                  }}
                  maxLength={500}
                  placeholder={
                    evidenceStatus === "rejected"
                      ? "Verplicht: beschrijf exact wat niet past…"
                      : "Bijzonderheden van de droge pastest…"
                  }
                />
              </label>

              <div className="compatibility-evidence-submit">
                <div>
                  <strong>
                    {evidenceStatus === "approved"
                      ? "Goedkeuring wordt direct werknemersbewijs"
                      : "Afwijzing blokkeert deze model/SKU-combinatie"}
                  </strong>
                  <span>Een later besluit voor exact hetzelfde model vervangt alleen de actuele status; historie blijft bewaard.</span>
                </div>
                <button
                  className={evidenceStatus === "approved" ? "primary-button" : "danger-ghost-button"}
                  type="button"
                  onClick={recordCompatibilityEvidence}
                >
                  {evidenceStatus === "approved" ? "Pastest goedkeuren" : "Combinatie afwijzen"}
                </button>
              </div>
              {evidenceMessage && (
                <div
                  className={
                    evidenceMessage.startsWith("Compatibiliteitsbewijs")
                    || evidenceMessage.startsWith("Afwijzing opgeslagen")
                      ? "policy-saved"
                      : "form-error"
                  }
                  role="status"
                >
                  {evidenceMessage}
                </div>
              )}
            </section>

            <section className="compatibility-evidence-history">
              <div className="workspace-card-heading">
                <div><h3>Recente compatibiliteitsbesluiten</h3><p>De laatste beoordeling per exact model bepaalt het werknemersadvies.</p></div>
              </div>
              <div className="table-wrap">
                <table className="operations-table">
                  <thead>
                    <tr><th>Moment</th><th>Model / artikel</th><th>Bewijs</th><th>Afmetingen</th><th>Besluit</th><th>Beoordelaar</th></tr>
                  </thead>
                  <tbody>
                    {recentCompatibilityEvidence.map((record) => (
                      <tr key={record.id}>
                        <td><strong>{formatDate(record.recordedAt)}</strong></td>
                        <td><strong>{record.model}</strong><span>{record.sku} · hangmap {record.storageNumber} · {record.variant}</span></td>
                        <td><strong>{record.manufacturerPartNumber}</strong><span>{record.photoReference}</span></td>
                        <td><strong>{record.keyboardWidthMm} × {record.keyboardHeightMm} mm</strong></td>
                        <td><span className={`model-group-status ${record.status}`}>{record.status === "approved" ? "Goedgekeurd" : "Afgewezen"}</span><small>{record.notes || "Geen bijzonderheden"}</small></td>
                        <td><strong>{record.reviewer}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {recentCompatibilityEvidence.length === 0 && (
                  <div className="empty">Nog geen fysieke model/SKU-pastest vastgelegd.</div>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === "continuity" && (
          <ProductionReadinessCenter
            records={recoveryDrills}
            actorName={actorName}
            sync={continuitySync}
            onRefresh={onRefreshContinuity}
            onRecord={onRecordRecoveryDrill}
          />
        )}

        {tab === "release" && (
          <GoLiveAcceptanceCenter
            records={goLiveAcceptanceRecords}
            actorName={actorName}
            sync={acceptanceSync}
            onRefresh={onRefreshAcceptance}
            onRecord={onRecordGoLiveAcceptance}
          />
        )}

        {tab === "workfloor" && (
          <WorkfloorAcceptanceCenter
            records={workfloorTrials}
            actorName={actorName}
            sync={workfloorSync}
            onRefresh={onRefreshWorkfloor}
            onRecord={onRecordWorkfloorTrial}
          />
        )}

        {tab === "scenarios" && (
          <OperationalScenarioCenter actorName={actorName} />
        )}

        {tab === "policy" && (
          <div className="operations-tab-content policy-grid">
            <section className="policy-editor">
              <h3>Conversieregels</h3>
              <label>
                <span>Verkoopwaardegrens keyboardprint</span>
                <select value={draft.thresholdEur} onChange={(event) => setDraft({ ...draft, thresholdEur: Number(event.target.value) })}>
                  {[100, 200, 300, 400, 500].map((amount) => <option value={amount} key={amount}>Vanaf €{amount}</option>)}
                </select>
                <small className="policy-field-help">De grens sluit zo altijd exact aan op de waardeklassen van werknemers.</small>
              </label>
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
              <div><span>AI-ONDERSTEUNING</span><h3>Layoutgroepen met één knop</h3></div>
              <p>KeyFlow zoekt zelf uit welke modellen dezelfde sticker kunnen gebruiken. Jij keurt een groep goed of af; bewijs vastleggen mag daarna en blokkeert de beslissing niet.</p>
              <ul>
                <li className="ready">Modelnamen, SKU, layout en hangmap gekoppeld</li>
                <li className="ready">Bronconflicten automatisch gemarkeerd</li>
                <li className="ready">Goedkeuring en afwijzing in audit bewaard</li>
                <li>Onderdeelnummers en foto&apos;s achteraf aanvullen</li>
              </ul>
            </section>
            <section className="data-continuity">
              <div>
                <span className="workspace-kicker">PILOTOPSLAG & HERSTEL</span>
                <h3>Automatisch bewaard op dit apparaat</h3>
                <p>{persistence.message}</p>
              </div>
              <dl>
                <div><dt>Opslagmodus</dt><dd>Lokale pilot</dd></div>
                <div><dt>Laatste opslag</dt><dd>{persistence.lastSavedAt ? formatDate(persistence.lastSavedAt) : persistence.ready ? "Nog geen wijziging" : "Laden…"}</dd></div>
                <div><dt>Teamsynchronisatie</dt><dd className="pending">Wacht op PostgreSQL</dd></div>
              </dl>
              <div className="continuity-actions">
                <button className="secondary-button" onClick={onExportBackup}>Back-up downloaden</button>
                <button className="secondary-button" onClick={() => backupInputRef.current?.click()}>Back-up herstellen</button>
                <input
                  ref={backupInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const result = await onRestoreBackup(file);
                    setBackupMessage(result.message);
                    event.target.value = "";
                  }}
                />
                {!resetArmed ? (
                  <button className="danger-ghost-button" onClick={() => setResetArmed(true)}>Pilotdata resetten</button>
                ) : (
                  <div className="reset-confirmation">
                    <span>Beginstand herstellen?</span>
                    <button onClick={() => { onResetPilotData(); setResetArmed(false); setBackupMessage("Pilotdata teruggezet naar de beginstand."); }}>Ja, reset</button>
                    <button onClick={() => setResetArmed(false)}>Annuleren</button>
                  </div>
                )}
                {backupMessage && <small>{backupMessage}</small>}
              </div>
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
    verification_scrap: "Afwijking na hangmapcontrole",
    quality_scrap: "Kwaliteitsuitval",
    manual_issue: "Handmatig afgeboekt",
    cycle_count_shortage: "Telverschil · tekort",
    cycle_count_overage: "Telverschil · overschot",
  }[reason] ?? reason;
}

function verificationOutcomeLabel(outcome: StickerVerificationReport["outcome"]) {
  return {
    passed: "Controle akkoord",
    blocked_unused: "Gestopt · niet afgeboekt",
    scrapped: "Uitval · afgeboekt",
  }[outcome];
}

function modelGroupStatusLabel(
  status: ModelGroupDecision["status"] | "pending",
) {
  return {
    pending: "Te beoordelen",
    approved: "Goedgekeurd",
    rejected: "Afgewezen",
  }[status];
}
