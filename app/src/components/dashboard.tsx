"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversionAdvisor } from "@/components/conversion-advisor";
import { AttentionGroups } from "@/components/attention-groups";
import { StockPlanner } from "@/components/stock-planner";
import { downloadTekstbestand } from "@/lib/bestand-downloaden";
import { AccessManagementDialog } from "@/components/access-management";
import { EmployeeWorkspace } from "@/components/employee-workspace";
import { MethodPhotoHelp } from "@/components/method-photo-help";
import { NoviplyWorkspace, type NoviplyTab } from "@/components/noviply-workspace";
import { ImportReviewDialog } from "@/components/import-review";
import { InventoryImportDialog } from "@/components/inventory-import";
import { InventoryCatalog } from "@/components/inventory-catalog";
import { InventoryMutationDialog, type InventoryItem } from "@/components/inventory-mutation";
import { OperationsManagement } from "@/components/operations-management";
import { PrinterCheckPrompt } from "@/components/printer-check-prompt";
import { PrintReminderPrompt } from "@/components/print-reminder-prompt";
import { SettingsWorkspace } from "@/components/settings-workspace";
import { ErrorReporter } from "@/components/error-reporter";
import { BrandMark } from "@/components/brand-mark";
import type { AppErrorEvent } from "@/server/error-log-service";
import { AddStickerSheetDialog } from "@/components/add-sticker-sheet";
import type { AcceptanceSyncState } from "@/components/go-live-acceptance-center";
import type { ContinuitySyncState } from "@/components/production-readiness-center";
import type { WorkfloorSyncState } from "@/components/workfloor-acceptance-center";
import {
  ConversionsWorkspace,
  ModelsWorkspace,
  OrdersWorkspace,
  ReportsWorkspace,
} from "@/components/planning-workspaces";
import {
  inventoryCatalog,
  inventoryCatalogSummary,
  type InventoryCatalogItem,
} from "@/data/inventory-catalog";
import type { UserRole } from "@/domain/access-control";
import type { ReKeyIdentity } from "@/domain/identity";
import {
  effectiveThreshold,
  workloadLabel,
  workloadThresholdShift,
} from "@/domain/conversion-policy";
import {
  createCompatibilityEvidenceRecord,
  emptyCompatibilityCheckpoints,
  latestCompatibilityEvidence,
  type CompatibilityEvidenceInput,
  type CompatibilityEvidenceRecord,
} from "@/domain/compatibility-evidence";
import {
  calculateStockCount,
  type StockCountInput,
  type StockCountRecord,
} from "@/domain/cycle-count";
import { calculateInventoryMutation } from "@/domain/inventory";
import { resupplyReady } from "@/domain/resupply";
import { conversionMethods, type ConversionMethodId } from "@/domain/conversion-policy";
import { realUsageUnits } from "@/domain/real-usage";
import {
  attentionByKind,
  attentionExportFilename,
  attentionItems,
  createAttentionCsv,
  splitAttention,
  attentionKindLabel,
} from "@/domain/attention";
import { createRunWaitlistEntry, type RunWaitlistEntry, type RunWaitlistInput } from "@/domain/run-waitlist";
import { unseenBatches, type PrintBatch } from "@/domain/print-batch";
import {
  reasonBlocksFuture,
  type NoviplyUnavailableRecord,
  type UnavailableReason,
} from "@/domain/noviply-availability";
import { dayKey } from "@/domain/reporting";
import {
  calculateCatalogThreshold,
  inventoryQuantity,
  migrateInventoryQuantities,
  withInventoryQuantity,
} from "@/domain/inventory-quantities";
import {
  createModelGroupDecision,
  type ModelGroupDecision,
  type ModelGroupProposal,
  type ModelGroupReviewInput,
} from "@/domain/model-grouping";
import {
  createPrintRequest,
  settlePrintRequest,
  type PrintRequestInput,
  type PrintRequestRecord,
  type PrintRequestStatus,
} from "@/domain/print-requests";
import {
  defaultOperationsPolicy,
  type InventoryMutationRequest,
  type InventoryTransactionEntry,
  type OperationsPolicy,
} from "@/domain/operations";
import {
  createOperationsSnapshot,
  readOperationsState,
  serializeOperationsSnapshot,
  trimHistory,
  writeOperationsState,
  CONVERSION_LOG_LIMIT,
  TRANSACTION_LIMIT,
} from "@/domain/operations-persistence";
import {
  fetchSharedState,
  patchPrintRequest,
  cancelPrintRequest,
  fetchNoviplyUnavailable,
  removeNoviplyUnavailable,
  postConversion,
  postInventoryMutation,
  postPrintRequest,
  fetchAccessRole,
  signInWithPin,
  changeOwnPin,
  askPrinterCheck,
  answerPrinterCheck,
  closePrinterCheck,
  sendPrintReminder,
  addToRunWaitlist,
  uploadPrintBatch,
  reopenBatchRow,
  settleBatchRow,
  settleWholePrintBatch,
  markPrintBatchSeen,
  removePrintBatch,
  resolveErrorEvent,
  settleRunWaitlistEntry,
  acknowledgePrintReminder,
  postVerificationReport,
  lockAccess,
  type PilotAccount,
  putOperationsPolicy,
  putSkuOverride,
  postStockCount,
  postModelGroupReview,
  postCompatibilityEvidence,
  withdrawCompatibilityRejection,
  KeyflowApiError,
  KeyflowOfflineError,
  type SharedOperationsState,
  type AddedSheet,
} from "@/lib/keyflow-api";
import {
  addPendingWrite,
  pendingWritesMessage,
  readPendingWrites,
  removePendingWrite,
  PENDING_WRITES_KEY,
  type PendingWrite,
} from "@/domain/pending-writes";
import { pilotActorFor } from "@/domain/pilot-actors";
import {
  openCheck,
  type PrinterCheckRecord,
} from "@/domain/printer-check";
import { openReminder, type PrintReminderRecord } from "@/domain/print-reminder";
import {
  createConversionLogEntry,
  type ConversionLogEntry,
  type ConversionLogInput,
} from "@/domain/conversion-log";
import {
  stickerVerificationFailureLabel,
  type StickerVerificationReport,
  type StickerVerificationReportInput,
} from "@/domain/sticker-verification";
import {
  createRecoveryDrill,
  type RecoveryDrillInput,
  type RecoveryDrillRecord,
} from "@/domain/production-readiness";
import {
  createGoLiveAcceptanceRecord,
  type GoLiveAcceptanceInput,
  type GoLiveAcceptanceRecord,
  type GoLiveAcceptanceSummary,
} from "@/domain/go-live-acceptance";
import {
  createWorkfloorTrialRecord,
  type WorkfloorTrialInput,
  type WorkfloorTrialRecord,
} from "@/domain/workfloor-acceptance";

type IconName =
  | "home"
  | "stock"
  | "convert"
  | "orders"
  | "models"
  | "reports"
  | "settings"
  | "scan"
  | "upload"
  | "plus"
  | "minus"
  | "alert"
  | "arrow"
  | "lock"
  | "user"
  | "sun"
  | "moon"
  | "book";

type ViewName =
  | "overview" | "attention" | "movers" | "layoutgroups" | "reports" | "settings"
  | "inventory" | "conversions" | "orders" | "models" | "operations";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    stock: <><path d="M4 7h16v13H4z"/><path d="m7 7 1.5-4h7L17 7M8 11h8"/></>,
    convert: <><path d="M5 7h12l-3-3M19 17H7l3 3"/><path d="m17 7 2 2-2 2M7 17l-2-2 2-2"/></>,
    orders: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    models: <><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.6h-4L10.4 6A8 8 0 0 0 8.8 7L6.5 6.1l-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1A8 8 0 0 0 10.4 18l.3 2.6h4L15 18a8 8 0 0 0 1.6-1l2.3 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.1Z"/></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M7 12h10M9 9v6M12 9v6M15 9v6"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 14v6h16v-6"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    alert: <><path d="M12 3 2.8 20h18.4Z"/><path d="M12 9v5M12 17h.01"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    user: <><circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/></>,
    moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>,
    book: <><path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4Z"/><path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6Z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/**
 * De vier vragen die management werkelijk stelt: wat is er vandaag gedaan,
 * welke stickers lopen hard, welke modellen delen een layout, en hoe ziet
 * het verloop eruit. Al het overige is verplaatst naar `parkedNavItems`.
 */
const navItems: { id: ViewName; label: string; icon: IconName }[] = [
  { id: "overview", label: "Vandaag", icon: "home" },
  // Aandacht nodig had een eigen plek verdiend. Op het dashboard groeide het
  // tot een muur van meldingen die de rest wegdrukte, terwijl je er meestal
  // alleen even doorheen wilt lopen en dan verder gaat.
  { id: "attention", label: "Aandacht nodig", icon: "alert" },
  { id: "movers", label: "Hardlopers", icon: "stock" },
  { id: "layoutgroups", label: "Layoutgroepen", icon: "models" },
  { id: "reports", label: "Rapportage", icon: "reports" },
];

/** Buiten de vier hoofdtabbladen: hier zet je de regels, niet het dagwerk. */
const settingsNavItem: { id: ViewName; label: string; icon: IconName } = {
  id: "settings", label: "Instellingen", icon: "settings",
};

/** Zichtbaar zodra de beheerdersschakelaar aan staat. Niets is verwijderd. */
const parkedNavItems: { id: ViewName; label: string; icon: IconName }[] = [
  { id: "inventory", label: "Voorraad", icon: "stock" },
  { id: "conversions", label: "Conversies", icon: "convert" },
  { id: "orders", label: "Bestellingen", icon: "orders" },
  { id: "models", label: "Modellen", icon: "models" },
  { id: "operations", label: "Beheer & analyse", icon: "settings" },
];

const viewHeadings: Record<ViewName, { title: string; subtitle: string }> = {
  overview: { title: "Vandaag", subtitle: "Wat er vandaag is omgezet en wat aandacht vraagt." },
  attention: { title: "Aandacht nodig", subtitle: "Alles waar iemand iets mee moet, bij elkaar." },
  movers: { title: "Hardlopers", subtitle: "Welke stickervellen hard lopen en welke blijven liggen." },
  layoutgroups: { title: "Layoutgroepen", subtitle: "Laat ReKey modellen groeperen die dezelfde sticker delen." },
  reports: { title: "Rapportage", subtitle: "Verbruik, dekking en verloop over de tijd." },
  settings: { title: "Instellingen", subtitle: "De regels waar de werkvloer op draait." },
  inventory: { title: "Voorraad", subtitle: "Zoek, controleer en plan alle keyboardstickers." },
  conversions: { title: "Conversies", subtitle: "Beheer de methode en voortgang per laptoporder." },
  orders: { title: "Bestellingen", subtitle: "Zet automatisch voorraadadvies om in een gecontroleerd concept." },
  models: { title: "Modellen", subtitle: "Beheer compatibiliteit zonder dubbele handmatige invoer." },
  operations: { title: "Beheer & analyse", subtitle: "Configureer uitvoering en analyseer iedere voorraadbeweging." },
};

/**
 * De kop boven het Noviply-scherm.
 *
 * Stond als vijf geneste ternaries in de opmaak zelf, en werd bij elk tabblad
 * dat erbij kwam een regel langer en een niveau dieper. Als tabel is er niets
 * te missen: elk tabblad zijn eigen zin, in het Engels want zij lezen mee.
 */
const noviplyHeadings: Record<NoviplyTab, { title: string; subtitle: string }> = {
  orders: {
    title: "Print request list",
    subtitle: "Extra sticker sheets to print for today.",
  },
  runs: {
    title: "Print runs",
    subtitle: "The two daily lists from the order system.",
  },
  blocked: {
    title: "Cannot print",
    subtitle: "What you told us you cannot do, and where a sheet did not fit.",
  },
  history: {
    title: "History",
    subtitle: "Everything ticked off, with the time and who handled it.",
  },
  stock: {
    title: "Stock & replenishment",
    subtitle: "What is running out, what to send, and what is standing still.",
  },
};

function noviplyHeading(tab: NoviplyTab) {
  return noviplyHeadings[tab];
}

/**
 * Stond hier als vier verzonnen regels met een verzonnen minimum van tien. De
 * echte hangmappen met de laagste voorraad zeggen hetzelfde, en zijn waar.
 */
/** De hangmappenwagen is de enige plek waar stickervellen fysiek liggen. */
const inventoryLocationCode = "HANGMAPPENWAGEN";

const initialLowStock: InventoryItem[] = inventoryCatalog
  .filter((item) => item.dataQuality === "ready")
  .map((item) => ({
    model: item.model,
    sku: item.sku,
    layout: item.layout,
    stock: item.stock,
    threshold: calculateCatalogThreshold(
      item.averageWeeklyDemand,
      item.leadTimeDays,
      item.safetyStockWeeks,
    ),
    catalogKey: item.catalogKey,
    storageNumber: item.storageNumber,
  }))
  .sort((left, right) => left.stock - right.stock || left.storageNumber - right.storageNumber)
  .slice(0, 8);

const methods = [
  { id: 1, name: "Basisstickers", detail: "Tijdelijk en voordelig · China", tone: "basic", status: "★" },
  { id: 2, name: "Noviply Voorraadstickers", detail: "Uit de hangmappen · Noviply", tone: "stock", status: "★★" },
  { id: 3, name: "Noviply Premium Stickers", detail: "Extra sterke lijmlaag · Noviply", tone: "premium", status: "★★★" },
  { id: 4, name: "Professionele Toetsenbordsprint", detail: "Permanent · Notebook Service (Roemenië)", tone: "professional", status: "★★★★" },
];

/** Welk scherm dit apparaat het laatst openhad; een voorkeur, geen recht. */
const LAATSTE_SCHERM_KEY = "rekey.laatste-scherm.v1";

const noviplyTabs: NoviplyTab[] = ["orders", "stock", "runs", "history"];
function isNoviplyTab(waarde: string): waarde is NoviplyTab {
  return (noviplyTabs as string[]).includes(waarde);
}

/**
 * Wat er bewaard staat. Alles wat er raar uitziet wordt genegeerd: dit komt uit
 * opslag die de gebruiker zelf kan aanpassen, dus het is een aanwijzing en
 * nooit een reden om iets open te zetten.
 */
function leesLaatsteScherm(): { rol: UserRole; tabblad: string } | null {
  try {
    const ruw = window.localStorage.getItem(LAATSTE_SCHERM_KEY);
    if (!ruw) return null;
    const gelezen: unknown = JSON.parse(ruw);
    if (typeof gelezen !== "object" || gelezen === null) return null;
    const { rol, tabblad } = gelezen as { rol?: unknown; tabblad?: unknown };
    if (rol !== "management" && rol !== "noviply" && rol !== "employee") return null;
    return { rol, tabblad: typeof tabblad === "string" ? tabblad : "" };
  } catch {
    return null;
  }
}

export function Dashboard({
  identity,
  onSignOut,
}: {
  identity: ReKeyIdentity;
  onSignOut?: () => void;
}) {
  const [role, setRole] = useState<UserRole>(identity.role);
  // Het naslagvenster met de vier niveaus; bereikbaar via "Hulp".
  const [niveausOpen, setNiveausOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>("overview");
  const [showParked, setShowParked] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(null);
  const [stockItems, setStockItems] = useState(initialLowStock);
  const [catalogQuantities, setCatalogQuantities] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<InventoryTransactionEntry[]>([]);
  const [operationsPolicy, setOperationsPolicy] = useState<OperationsPolicy>(defaultOperationsPolicy);
  const [verificationReports, setVerificationReports] = useState<StickerVerificationReport[]>([]);
  const [stockCounts, setStockCounts] = useState<StockCountRecord[]>([]);
  const [printRequests, setPrintRequests] = useState<PrintRequestRecord[]>([]);
  const [conversionLog, setConversionLog] = useState<ConversionLogEntry[]>([]);
  // Noviply bedient de premiumstickerprinter op afstand; of hij klaarstaat kan
  // alleen de werkvloer zien.
  const [printerChecks, setPrinterChecks] = useState<PrinterCheckRecord[]>([]);
  const [printReminders, setPrintReminders] = useState<PrintReminderRecord[]>([]);
  // Laptops die apart staan tot hun vel met de volgende ronde meekomt. Dit is
  // geen aanvraag bij Noviply; zij zien deze lijst niet.
  const [runWaitlist, setRunWaitlist] = useState<RunWaitlistEntry[]>([]);
  // De rondes uit het ordersysteem. Die lijst werd gemaild; nu staat hij hier.
  const [printBatches, setPrintBatches] = useState<PrintBatch[]>([]);
  const [noviplyUnavailable, setNoviplyUnavailable] = useState<NoviplyUnavailableRecord[]>([]);
  // Onverwachte fouten uit de server en uit de schermen. Stonden alleen in een
  // console die niemand leest.
  const [openErrors, setOpenErrors] = useState<AppErrorEvent[]>([]);
  const [noviplyTab, setNoviplyTab] = useState<NoviplyTab>("orders");
  // Regels waar de Excel-import geen bruikbaar artikelnummer opleverde, kunnen
  // hier worden aangevuld zonder de bron aan te passen.
  const [skuOverrides, setSkuOverrides] = useState<Record<string, string>>({});
  const [modelGroupDecisions, setModelGroupDecisions] = useState<ModelGroupDecision[]>([]);
  const [compatibilityEvidenceRecords, setCompatibilityEvidenceRecords] = useState<CompatibilityEvidenceRecord[]>([]);
  const [recoveryDrills, setRecoveryDrills] = useState<RecoveryDrillRecord[]>([]);
  const [goLiveAcceptanceRecords, setGoLiveAcceptanceRecords] = useState<GoLiveAcceptanceRecord[]>([]);
  const [workfloorTrials, setWorkfloorTrials] = useState<WorkfloorTrialRecord[]>([]);
  const [continuitySync, setContinuitySync] = useState<ContinuitySyncState>({
    mode: identity.mode === "entra" ? "central" : "local",
    status: identity.mode === "entra" ? "loading" : "local",
    message: identity.mode === "entra"
      ? "Persoonlijke sessie wordt met de centrale database verbonden."
      : "Herstelhistorie wordt opgenomen in de lokale pilotback-up.",
    centralReadiness: null,
  });
  const [continuityRefreshToken, setContinuityRefreshToken] = useState(0);
  const [acceptanceSync, setAcceptanceSync] = useState<AcceptanceSyncState>({
    mode: identity.mode === "entra" ? "central" : "local",
    status: identity.mode === "entra" ? "loading" : "local",
    message: identity.mode === "entra"
      ? "Persoonlijke sessie wordt met het centrale go-livedossier verbonden."
      : "Acceptatiebesluiten worden opgenomen in de lokale pilotback-up.",
  });
  const [acceptanceRefreshToken, setAcceptanceRefreshToken] = useState(0);
  const [workfloorSync, setWorkfloorSync] = useState<WorkfloorSyncState>({
    mode: identity.mode === "entra" ? "central" : "local",
    status: identity.mode === "entra" ? "loading" : "local",
    message: identity.mode === "entra"
      ? "Persoonlijke sessie wordt met de centrale werkvloerproeven verbonden."
      : "Werkvloerproeven worden opgenomen in de lokale pilotback-up.",
  });
  const [workfloorRefreshToken, setWorkfloorRefreshToken] = useState(0);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [sharedStatus, setSharedStatus] = useState<"loading" | "online" | "offline" | "local">("loading");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState<PendingWrite[]>([]);
  // De versie die we zagen; daarmee merken we dat een ander het beleid
  // ondertussen heeft aangepast in plaats van hem stil te overschrijven.
  const [policyVersion, setPolicyVersion] = useState(0);
  /** Welke layouts de toetsenbordsprinter aankan; leeg = nog niet ingevuld. */
  const [directPrintLayouts, setDirectPrintLayouts] = useState<string[]>([]);
  /** Vellen die na de Excel-import zijn toegevoegd; die staan niet in de bron. */
  const [addedSheets, setAddedSheets] = useState<AddedSheet[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [persistenceMessage, setPersistenceMessage] = useState("Lokale pilotopslag laden…");
  const [mutation, setMutation] = useState<{
    mode: "issue" | "receipt";
    item: InventoryItem;
    catalogItem?: InventoryCatalogItem;
  } | null>(null);
  const [lastAction, setLastAction] = useState("");
  const demoAccess = identity.mode === "pilot";
  const actorName = identity.mode === "entra"
    ? identity.displayName
    : role === "management"
      ? "Tim Beek"
      : role === "noviply"
        ? "Noviply"
        : "Medewerker";
  const actorInitials = initialsFor(actorName);
  /**
   * De ingebouwde catalogus komt uit de Excel. Wat daarna is toegevoegd staat
   * alleen in de database — zonder samenvoegen zou een nieuw vel voor de
   * werkvloer onvindbaar blijven tot de volgende import.
   */
  const workingCatalog = useMemo(() => {
    // Een toegevoegd vel vervangt de geblokkeerde bronregel met hetzelfde
    // hangmapnummer; anders zou de hangmap twee keer voorkomen.
    const replaced = new Set(addedSheets.map((sheet) => sheet.storageNumber));
    return [
    ...inventoryCatalog.filter((item) => !replaced.has(item.storageNumber)),
    ...addedSheets.map((sheet) => ({
      catalogKey: sheet.catalogKey,
      sourceRow: 0,
      model: sheet.model,
      modelAliases: [sheet.model],
      sku: sheet.sku,
      // Een vel dat hier is toegevoegd heeft altijd zijn eigen nummer gekregen.
      stockKey: sheet.sku,
      ownNumber: false,
      sharedNumber: false,
      layout: sheet.layout as InventoryCatalogItem["layout"],
      stock: sheet.stock,
      reserved: 0,
      averageWeeklyDemand: 0,
      leadTimeDays: 0,
      safetyStockWeeks: 0,
      location: "Hangmappenwagen" as const,
      storageNumber: sheet.storageNumber,
      supplier: "Noviply" as const,
      unitCost: 0,
      compatibleModels: 1,
      dataQuality: "ready" as const,
      dataQualityIssues: [],
      planningDataStatus: "unconfigured" as const,
    })),
    ];
  }, [addedSheets]);
  // In pilotmodus handelt elke rol met een eigen account, zodat de database de
  // rechten kan afdwingen. Zie pilot-actors.ts voor waarom dat eerlijk is.
  // Met een persoonlijke login bepaalt de server zelf wie er handelt; dan mag
  // de browser dat niet kunnen opgeven.
  const actorId = identity.mode === "entra" ? "" : pilotActorFor(role);
  /**
   * Stond hier hardgecodeerd, en zou dus voor altijd dezelfde maandag melden.
   * Pas na het aankoppelen, anders wijkt de server af van de browser.
   */
  const [headerDate, setHeaderDate] = useState("");

  /**
   * Licht of donker. De keuze staat al op <html> voordat er iets getekend is
   * (zie layout.tsx); hier lezen we hem alleen uit zodat de knop het juiste
   * pictogram laat zien, en schrijven we hem weg als iemand hem omzet.
   */
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const staat = document.documentElement.getAttribute("data-theme");
    setTheme(staat === "light" ? "light" : "dark");
  }, []);

  function toggleTheme() {
    const volgende = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", volgende);
    try {
      localStorage.setItem("keyflow.theme", volgende);
    } catch {
      // Zonder opslag werkt het scherm nog, alleen onthoudt het de keuze niet.
    }
    setTheme(volgende);
  }

  /**
   * Bijbestellen begint pas als er genoeg gewerkt is om verbruik uit af te
   * lezen. Tot die tijd heet het scherm bij Noviply gewoon "Stock" — "running
   * low" beloven zonder te kunnen weten wat laag is, is erger dan zwijgen.
   */
  const resupplyStarted = useMemo(
    () => resupplyReady(transactions, dayKey(new Date())),
    [transactions],
  );

  useEffect(() => {
    setHeaderDate(new Date()
      .toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })
      .toUpperCase());
  }, []);
  const filteredStock = useMemo(
    () => stockItems.filter((item) => `${item.model} ${item.sku} ${item.layout}`.toLowerCase().includes(query.toLowerCase())),
    [query, stockItems],
  );
  const defaultItem = stockItems.find((item) => item.stock > 0) ?? stockItems[0];
  const today = new Date().toISOString().slice(0, 10);
  // Alleen vellen die op een laptop zijn gegaan. Tellingcorrecties zijn geen
  // verbruik, en die stonden hier wel in het cijfer.
  const todayIssued = realUsageUnits(
    transactions.filter((entry) => entry.occurredAt.startsWith(today)),
  );

  /**
   * Wat er vandaag is afgehandeld, per methode.
   *
   * Het getal "vandaag verbruikt" zegt hoevéél, niet waarmee. Voor management is
   * dat tweede net zo interessant: gaan de laptops door de kast (gratis) of naar
   * de printer (kosten)? Eén balk laat die verhouding in één blik zien.
   */
  const vandaagPerMethode = useMemo(() => {
    const vandaag = conversionLog.filter((entry) => entry.occurredAt.startsWith(today));
    const volgorde: ConversionMethodId[] = [
      "none",
      "loose_stickers",
      "noviply_sheet",
      "printed_sticker",
      "direct_reprint",
    ];
    const per = volgorde
      .map((method) => ({
        method,
        naam: conversionMethods[method].name,
        toon: conversionMethods[method].tone,
        aantal: vandaag
          .filter((entry) => entry.method === method)
          .reduce((som, entry) => som + (entry.quantity ?? 1), 0),
      }))
      .filter((regel) => regel.aantal > 0);
    return { regels: per, totaal: per.reduce((som, regel) => som + regel.aantal, 0) };
  }, [conversionLog, today]);
  const currentCatalogStock = inventoryCatalog.reduce(
    (sum, item) => sum + inventoryQuantity(catalogQuantities, item),
    0,
  );
  // Twee cijfers die je zonder aannames kunt natellen: hoeveel hangmappen leeg
  // zijn, en hoeveel laptops op Noviply staan te wachten.
  const emptyFolderCount = inventoryCatalog.filter(
    (item) => item.dataQuality === "ready" && inventoryQuantity(catalogQuantities, item) === 0,
  ).length;
  /**
   * Meldingen van de werkvloer dat een vel niet paste. Een geslaagde controle
   * hoeft management niet te zien; een mislukte wel, want dan is er iets mis met
   * de hangmap, de koppeling of de bron.
   */
  const attention = useMemo(
    () => attentionItems({
      verificationReports,
      printRequests,
      printBatches,
      catalog: inventoryCatalog,
      quantities: catalogQuantities,
    }),
    [verificationReports, printRequests, printBatches, catalogQuantities],
  );
  /** Waar nu iemand op staat te wachten; dat getal staat in het menu. */
  const dringend = useMemo(() => splitAttention(attention).nu.length, [attention]);
  const awaitingPrintCount = printRequests.filter(
    (request) => request.status === "requested",
  ).length;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restored = readOperationsState(window.localStorage);
      if (restored.success && restored.state) {
        const migratedQuantities = migrateInventoryQuantities(
          restored.state.catalogQuantities,
          inventoryCatalog,
        );
        setCatalogQuantities(migratedQuantities);
        setTransactions(restored.state.transactions);
        // Een snapshot van vóór een nieuwe beleidsinstelling mist die sleutel;
        // zonder de standaardwaarden erbij valt het scherm erover.
        setOperationsPolicy({ ...defaultOperationsPolicy, ...restored.state.operationsPolicy });
        setVerificationReports(restored.state.verificationReports);
        setStockCounts(restored.state.stockCounts);
        setPrintRequests(restored.state.printRequests);
        setSkuOverrides(restored.state.skuOverrides);
        setConversionLog(restored.state.conversionLog);
        setModelGroupDecisions(restored.state.modelGroupDecisions);
        setCompatibilityEvidenceRecords(restored.state.compatibilityEvidenceRecords);
        if (identity.mode === "pilot") {
          setRecoveryDrills(restored.state.recoveryDrills);
          setGoLiveAcceptanceRecords(restored.state.goLiveAcceptanceRecords);
          setWorkfloorTrials(restored.state.workfloorTrials);
        }
        setStockItems((items) => items.map((item) => ({
          ...item,
          stock: quantityForInventoryItem(migratedQuantities, item),
        })));
        setLastSavedAt(restored.state.savedAt);
        setPersistenceMessage("Pilotgegevens van dit apparaat hersteld.");
      } else if (!restored.success) {
        setPersistenceMessage(`${restored.error} De veilige beginstand is geladen.`);
      } else {
        setPersistenceMessage("Nieuwe lokale pilotopslag gestart.");
      }
      setPersistenceReady(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [identity.mode]);

  /**
   * De gedeelde stand komt van de server: voorraad, mutaties, de bestellijst en
   * het conversielogboek. Lukt dat niet, dan blijft staan wat er lokaal bewaard
   * was — een medewerker zonder verbinding moet nog steeds kunnen zien wat waar
   * ligt. Zodra de verbinding terug is, wint de server.
   */
  const applySharedState = useCallback((state: SharedOperationsState) => {
    setCatalogQuantities(state.catalogQuantities);
    setTransactions(state.transactions);
    setPrintRequests(state.printRequests);
    setConversionLog(state.conversionLog);
    setSkuOverrides(state.skuOverrides);
    setStockCounts(state.stockCounts);
    setModelGroupDecisions(state.modelGroupDecisions);
    setCompatibilityEvidenceRecords(state.compatibilityEvidenceRecords);
    setPrinterChecks(state.printerChecks);
    setPrintReminders(state.printReminders);
    setRunWaitlist(state.runWaitlist ?? []);
    setPrintBatches(state.printBatches ?? []);
    setNoviplyUnavailable(state.noviplyUnavailable ?? []);
    setOpenErrors(state.openErrors ?? []);
    setVerificationReports(state.verificationReports);
    if (state.operationsPolicy) {
      setOperationsPolicy({ ...defaultOperationsPolicy, ...state.operationsPolicy });
    }
    setPolicyVersion(state.operationsPolicyVersion);
    setDirectPrintLayouts(state.directPrintLayouts);
    setAddedSheets(state.addedSheets);
    setStockItems((items) => items.map((item) => ({
      ...item,
      stock: quantityForInventoryItem(state.catalogQuantities, item),
    })));
    setLastSyncedAt(state.savedAt);
  }, []);

  const refreshSharedState = useCallback(async () => {
    try {
      applySharedState(await fetchSharedState(actorId));
      setSharedStatus("online");
      return true;
    } catch (error) {
      // Een regelfout hoort bij een handeling, niet bij ophalen; alles wat hier
      // misgaat betekent in de praktijk: even geen server.
      setSharedStatus(error instanceof KeyflowApiError && error.code === "DATABASE_NOT_CONFIGURED"
        ? "local"
        : "offline");
      return false;
    }
  }, [actorId, applySharedState]);

  useEffect(() => {
    if (!persistenceReady) return;
    void refreshSharedState();
  }, [persistenceReady, refreshSharedState]);

  /* ---------- handelingen die op verbinding wachten ---------- */

  useEffect(() => {
    setPendingWrites(readPendingWrites(window.localStorage.getItem(PENDING_WRITES_KEY)));
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;
    window.localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(pendingWrites));
  }, [pendingWrites, persistenceReady]);

  /** Wat er in de wachtrij stond, in woorden die je kunt natrekken. */
  function beschrijfWrite(write: PendingWrite) {
    const p = (write as { payload?: Record<string, unknown> }).payload ?? {};
    const order = typeof p.orderReference === "string" && p.orderReference ? ` · order ${p.orderReference}` : "";
    const sku = typeof p.sku === "string" && p.sku ? ` · ${p.sku}` : "";
    const soort: Record<string, string> = {
      mutation: "voorraadboeking",
      printRequest: "printaanvraag",
      settlePrintRequest: "afvinken van een printaanvraag",
      conversion: "conversieregistratie",
      stockCount: "telling",
      modelGroupReview: "layoutgroepbesluit",
      compatibilityEvidence: "compatibiliteitsbewijs",
      skuOverride: "artikelnummer",
      verificationReport: "controlemelding",
      runWaitlist: "laptop apart leggen",
    };
    return `${soort[write.kind] ?? write.kind}${sku}${order}`;
  }

  const sendPendingWrite = useCallback(async (write: PendingWrite) => {
    if (write.kind === "mutation") {
      await postInventoryMutation(write.payload as never);
    } else if (write.kind === "printRequest") {
      await postPrintRequest(write.payload as never);
    } else if (write.kind === "settlePrintRequest") {
      await patchPrintRequest(write.requestId, write.payload as never);
    } else if (write.kind === "conversion") {
      await postConversion(write.payload as never);
    } else if (write.kind === "stockCount") {
      await postStockCount(write.payload);
    } else if (write.kind === "modelGroupReview") {
      await postModelGroupReview(write.payload);
    } else if (write.kind === "compatibilityEvidence") {
      await postCompatibilityEvidence(write.payload);
    } else if (write.kind === "verificationReport") {
      await postVerificationReport(write.payload);
    } else if (write.kind === "runWaitlist") {
      await addToRunWaitlist(write.payload as never);
    } else {
      await putSkuOverride(write.payload as never);
    }
  }, []);

  /**
   * Alsnog versturen wat is blijven staan. Eén voor één en op volgorde: een
   * ontvangst die vóór een afboeking hoorde te gaan mag niet omdraaien. Een
   * regel die de server inhoudelijk afwijst gaat eruit — die blijft anders
   * eeuwig de rij blokkeren.
   */
  const flushPendingWrites = useCallback(async () => {
    const queue = pendingWrites;
    if (queue.length === 0) return;
    /*
     * Alles wat geen inhoudelijke afwijzing is, blijft staan voor een volgende
     * poging.
     *
     * Hier werd elke fout behandeld als "de server wil dit niet" en de handeling
     * weggegooid. Maar de meeste antwoorden betekenen "nu even niet": te veel
     * verzoeken tegelijk (het hele pand zit achter één adres, en er mogen er
     * zestig per minuut binnenkomen), een verlopen aanmelding na een nacht, of
     * een storing aan de serverkant. Viel de wifi een half uur weg met tachtig
     * afboekingen in de rij, dan gingen de eerste zestig goed en werden de rest
     * stuk voor stuk vernietigd — laptops omgezet, niets afgeboekt, en niemand
     * die weet welke.
     */
    const magOpnieuw = (error: unknown) => {
      if (error instanceof KeyflowOfflineError) return true;
      if (!(error instanceof KeyflowApiError)) return true;
      // 429 te druk · 401/403 aanmelding verlopen · 5xx storing aan hun kant.
      return error.status === 429 || error.status === 401 || error.status === 403 || error.status >= 500;
    };

    for (const write of queue) {
      try {
        await sendPendingWrite(write);
        setPendingWrites((current) => removePendingWrite(current, write.id));
      } catch (error) {
        if (magOpnieuw(error)) {
          // Stoppen, niet doorrazen: de volgende loopt tegen dezelfde muur en
          // dan is de hele rij binnen een seconde opgebrand.
          setLastAction(error instanceof KeyflowOfflineError
            ? "Geen verbinding; bewaarde handelingen blijven staan."
            : "De server kan het even niet aan; bewaarde handelingen blijven staan en gaan straks alsnog.");
          return;
        }
        setPendingWrites((current) => removePendingWrite(current, write.id));
        // Wát er sneuvelt, niet alleen dát er iets sneuvelde: zonder ordernummer
        // of artikelnummer valt er met de hand niets te herstellen.
        const wat = beschrijfWrite(write);
        setLastAction(`Geweigerd door de server en overgeslagen: ${wat}. Herstel dit met de hand.`);
      }
    }
    await refreshSharedState();
  }, [pendingWrites, refreshSharedState, sendPendingWrite]);

  useEffect(() => {
    if (sharedStatus !== "online" || pendingWrites.length === 0) return;
    void flushPendingWrites();
    // Alleen wanneer de verbinding terugkomt of er iets bijkomt; niet bij elke
    // wijziging van de wachtrij zelf, anders herhaalt hij zichzelf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedStatus, pendingWrites.length]);

  /**
   * De werkvloer en management werken in het Nederlands, Noviply in het Engels.
   * Deze regel staat in de voet van elk scherm, dus ook in het hunne — en dan
   * hoort hij in hun taal te staan.
   */
  /**
   * Noviply werkt in het Engels. Dat gold al voor hun schermen, maar de korte
   * meldingen na een handeling kwamen uit de gedeelde code en bleven Nederlands
   * — dus stond er "Gevraagd aan de werkvloer…" onder een Engels scherm. Eén
   * vlag hier, en elke melding die zij kunnen veroorzaken volgt hem.
   */
  const engelsScherm = role === "noviply";

  const syncLabel = (() => {
    const engels = engelsScherm;
    if (!persistenceReady || sharedStatus === "loading") {
      return engels ? "Connecting to the database…" : "Verbinden met de database…";
    }
    const waiting = pendingWritesMessage(pendingWrites.length);
    if (sharedStatus === "offline") {
      return waiting || (engels
        ? "No connection — showing the last known state."
        : "Geen verbinding — er wordt getoond wat het laatst bekend was.");
    }
    if (sharedStatus === "local") {
      return engels
        ? "Saved on this device only; the database is not connected."
        : "Alleen op dit apparaat bewaard; de database is niet aangesloten.";
    }
    if (waiting) return waiting;
    const moment = lastSyncedAt ? formatPersistenceTime(lastSyncedAt) : "";
    // Voor Noviply hoort hier te staan dát het scherm zichzelf bijhoudt. Zij
    // wachten op werk dat van onze kant komt; zonder dat zinnetje gaan ze uit
    // onzekerheid verversen, of erger: ze doen het niet en missen een ronde.
    if (engels) {
      return `Live — new runs and requests appear on their own${moment ? ` · last checked ${moment}` : ""}`;
    }
    return `Gedeeld met iedereen${moment ? ` · bijgewerkt ${moment}` : ""}`;
  })();

  function queueWrite(write: PendingWrite) {
    setPendingWrites((current) => addPendingWrite(current, write));
    setSharedStatus("offline");
  }

  // Noviply moet een aanvraag zien zonder de pagina te verversen. Alleen
  // ophalen als het tabblad open staat: op de achtergrond pollen kost niets dan
  // batterij en verbindingen.
  useEffect(() => {
    if (!persistenceReady) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSharedState();
    }, 20_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSharedState();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [persistenceReady, refreshSharedState]);

  useEffect(() => {
    if (identity.mode !== "entra" || identity.role !== "management") return;
    const controller = new AbortController();
    setContinuitySync({
      mode: "central",
      status: "loading",
      message: "Herstelhistorie en runtimecontrole worden centraal geladen.",
      centralReadiness: null,
    });

    Promise.all([
      fetch("/api/operations/recovery-drills", { signal: controller.signal }),
      fetch("/api/operations/readiness", { signal: controller.signal }),
    ]).then(async ([historyResponse, readinessResponse]) => {
      if (!historyResponse.ok) throw new Error(await responseErrorMessage(historyResponse));
      if (!readinessResponse.ok) throw new Error(await responseErrorMessage(readinessResponse));
      const history = await historyResponse.json() as { records: RecoveryDrillRecord[] };
      const centralReadiness = await readinessResponse.json() as ContinuitySyncState["centralReadiness"];
      setRecoveryDrills(history.records);
      setContinuitySync({
        mode: "central",
        status: "ready",
        message: "Herstelhistorie komt uit PostgreSQL en iedere wijziging gebruikt de persoonlijke sessie.",
        centralReadiness,
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setContinuitySync({
        mode: "central",
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Centrale continuïteitsgegevens konden niet worden geladen.",
        centralReadiness: null,
      });
    });

    return () => controller.abort();
  }, [continuityRefreshToken, identity.mode, identity.role]);

  useEffect(() => {
    if (identity.mode !== "entra" || identity.role !== "management") return;
    const controller = new AbortController();
    setAcceptanceSync({
      mode: "central",
      status: "loading",
      message: "Het centrale go-livedossier wordt geladen.",
    });
    fetch("/api/operations/go-live-acceptance", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseErrorMessage(response));
        return response.json() as Promise<{
          records: GoLiveAcceptanceRecord[];
          summary: GoLiveAcceptanceSummary;
        }>;
      })
      .then(({ records, summary }) => {
        setGoLiveAcceptanceRecords(records);
        setAcceptanceSync({
          mode: "central",
          status: "ready",
          message: `${summary.approved}/5 poorten centraal goedgekeurd · besluiten zijn aan de persoonlijke sessie gekoppeld.`,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAcceptanceSync({
          mode: "central",
          status: "error",
          message: error instanceof Error
            ? error.message
            : "Het centrale go-livedossier kon niet worden geladen.",
        });
      });
    return () => controller.abort();
  }, [acceptanceRefreshToken, identity.mode, identity.role]);

  useEffect(() => {
    if (identity.mode !== "entra" || identity.role !== "management") return;
    const controller = new AbortController();
    setWorkfloorSync({
      mode: "central",
      status: "loading",
      message: "De centrale werkvloerproeven worden geladen.",
    });
    fetch("/api/operations/workfloor-trials", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseErrorMessage(response));
        return response.json() as Promise<{
          records: WorkfloorTrialRecord[];
          summary: {
            total: number;
            passed: number;
            failed: number;
            open: number;
          };
        }>;
      })
      .then(({ records, summary }) => {
        setWorkfloorTrials(records);
        setWorkfloorSync({
          mode: "central",
          status: "ready",
          message: `${summary.total} proef/proeven centraal · ${summary.passed} geslaagd · ${summary.open} open.`,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setWorkfloorSync({
          mode: "central",
          status: "error",
          message: error instanceof Error
            ? error.message
            : "De centrale werkvloerproeven konden niet worden geladen.",
        });
      });
    return () => controller.abort();
  }, [identity.mode, identity.role, workfloorRefreshToken]);

  useEffect(() => {
    if (!persistenceReady) return;
    let savedAt: string | null = null;
    let message = "Lokale opslag is niet gelukt. Download een back-up via Beheer & analyse.";
    try {
      const existingLocalState = identity.mode === "entra"
        ? readOperationsState(window.localStorage)
        : null;
      const locallyStoredRecoveryDrills =
        existingLocalState?.success && existingLocalState.state
          ? existingLocalState.state.recoveryDrills
          : [];
      const locallyStoredGoLiveAcceptanceRecords =
        existingLocalState?.success && existingLocalState.state
          ? existingLocalState.state.goLiveAcceptanceRecords
          : [];
      const locallyStoredWorkfloorTrials =
        existingLocalState?.success && existingLocalState.state
          ? existingLocalState.state.workfloorTrials
          : [];
      const snapshot = createOperationsSnapshot({
        catalogQuantities,
        // Snoeien vóór het opslaan: loopt een lijst tegen zijn grens aan, dan
        // zou hij bij inlezen in zijn geheel wegvallen.
        transactions: trimHistory(transactions, TRANSACTION_LIMIT),
        operationsPolicy,
        verificationReports,
        stockCounts,
        modelGroupDecisions,
        compatibilityEvidenceRecords,
        recoveryDrills: identity.mode === "pilot"
          ? recoveryDrills
          : locallyStoredRecoveryDrills,
        goLiveAcceptanceRecords: identity.mode === "pilot"
          ? goLiveAcceptanceRecords
          : locallyStoredGoLiveAcceptanceRecords,
        workfloorTrials: identity.mode === "pilot"
          ? workfloorTrials
          : locallyStoredWorkfloorTrials,
        printRequests,
        skuOverrides,
        conversionLog: trimHistory(conversionLog, CONVERSION_LOG_LIMIT),
      });
      writeOperationsState(window.localStorage, snapshot);
      savedAt = snapshot.savedAt;
      message = "Wijzigingen automatisch bewaard op dit apparaat.";
    } catch {
      // De foutmelding staat al klaar; de laatst bekende geldige opslag blijft staan.
    }
    const statusUpdate = window.setTimeout(() => {
      if (savedAt) setLastSavedAt(savedAt);
      setPersistenceMessage(message);
    }, 0);
    return () => window.clearTimeout(statusUpdate);
  }, [
    catalogQuantities,
    compatibilityEvidenceRecords,
    modelGroupDecisions,
    operationsPolicy,
    persistenceReady,
    stockCounts,
    transactions,
    verificationReports,
    recoveryDrills,
    goLiveAcceptanceRecords,
    workfloorTrials,
    printRequests,
    skuOverrides,
    conversionLog,
    identity.mode,
  ]);

  /**
   * Een voorraadboeking van management gaat dezelfde weg als die van de
   * werkvloer: naar de server, en bij geen verbinding in de wachtrij.
   *
   * Hier stond alleen een wijziging van het scherm. Er ging niets naar de
   * database en er werd niets bewaard, terwijl het scherm elke twintig seconden
   * de stand bij de server ophaalt — dus een levering van tweehonderd vellen
   * stond na twintig seconden weer op de oude stand, zonder foutmelding. De
   * reden en de opmerking uit het venster gingen ook verloren.
   */
  async function saveMutation(
    newQuantity: number,
    quantityDelta: number,
    details: { reasonCode: string; notes: string },
  ) {
    if (!mutation) return;
    const catalogItem = mutation.catalogItem
      ?? findCatalogItemForInventoryItem(mutation.item);
    if (!catalogItem) {
      setLastAction(`Geen hangmap gevonden voor ${mutation.item.sku}; er is niets geboekt.`);
      setMutation(null);
      return;
    }
    setMutation(null);
    try {
      await recordEmployeeInventoryMutation({
        sku: catalogItem.stockKey,
        type: quantityDelta > 0 ? "receipt" : "issue",
        quantity: Math.abs(quantityDelta),
        reasonCode: details.reasonCode,
        notes: details.notes,
        actor: actorName,
      });
      setLastAction(`${catalogItem.sku}: ${quantityDelta > 0 ? "+" : ""}${quantityDelta} geboekt op hangmap ${catalogItem.storageNumber}.`);
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "De boeking is niet gelukt.");
    }
    void newQuantity;
  }

  async function recordEmployeeInventoryMutation(request: InventoryMutationRequest) {
    // Op de voorraadsleutel, niet op het artikelnummer: dat laatste kan bij twee
    // hangmappen staan en dan weet je niet uit welke map je afboekt.
    const matchingItems = workingCatalog.filter(
      (candidate) =>
        candidate.dataQuality === "ready"
        && candidate.stockKey === request.sku,
    );
    if (matchingItems.length !== 1) {
      throw new Error(`Sticker-SKU ${request.sku} is onbekend of geblokkeerd voor boeken.`);
    }
    const item = matchingItems[0];
    const currentQuantity = inventoryQuantity(catalogQuantities, item);
    const idempotencyKey = `employee-${crypto.randomUUID()}`;
    // Eerst lokaal narekenen: dat levert een begrijpelijke melding op ("dit vel
    // is op") in plaats van een foutcode van de server.
    let result = calculateInventoryMutation({
      sku: request.sku,
      currentQuantity,
      type: request.type,
      quantity: request.quantity,
      reasonCode: request.reasonCode,
      notes: request.notes,
      idempotencyKey,
    });

    const payload = {
      sku: item.stockKey,
      locationCode: inventoryLocationCode,
      type: request.type,
      quantity: request.quantity,
      reasonCode: request.reasonCode,
      notes: request.notes,
      reference: request.reference,
      idempotencyKey,
      actorId,
    };

    try {
      // De server houdt de echte stand bij: een collega kan net het laatste vel
      // hebben gepakt.
      const confirmed = await postInventoryMutation(payload);
      result = {
        ...result,
        newQuantity: confirmed.newQuantity,
        quantityDelta: confirmed.quantityDelta,
      };
      setSharedStatus("online");
    } catch (error) {
      if (!(error instanceof KeyflowOfflineError)) throw error;
      // Geen verbinding: de laptop is er wel. Lokaal toepassen en later sturen.
      queueWrite({ kind: "mutation", id: idempotencyKey, payload });
    }

    setCatalogQuantities((current) => withInventoryQuantity(current, item, result.newQuantity));
    setStockItems((items) => items.map((stockItem) =>
      stockItem.catalogKey === item.catalogKey
        ? { ...stockItem, stock: result.newQuantity }
        : stockItem,
    ));
    setTransactions((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        catalogKey: item.catalogKey,
        storageNumber: item.storageNumber,
        sku: item.sku,
        model: item.model,
        layout: item.layout,
        type: request.type,
        quantityDelta: result.quantityDelta,
        reasonCode: request.reasonCode,
        notes: request.notes,
        actor: request.actor,
        reference: request.reference,
      },
    ]);
    setLastAction(`${item.sku}: ${result.quantityDelta > 0 ? "+" : ""}${result.quantityDelta} door ${request.actor} · voorraad ${result.newQuantity}`);
    return result;
  }

  function recordStockCount(input: StockCountInput) {
    const item = inventoryCatalog.find(({ catalogKey }) => catalogKey === input.catalogKey);
    if (!item) throw new Error("De gekozen hangmap bestaat niet in de catalogus.");
    const expectedQuantity = inventoryQuantity(catalogQuantities, item);
    const result = calculateStockCount(
      expectedQuantity,
      input.countedQuantity,
      input.notes,
    );
    const occurredAt = new Date().toISOString();
    const record: StockCountRecord = {
      id: crypto.randomUUID(),
      occurredAt,
      catalogKey: item.catalogKey,
      storageNumber: item.storageNumber,
      sku: item.sku,
      model: item.model,
      ...result,
      actor: actorName,
    };

    setCatalogQuantities((current) =>
      withInventoryQuantity(current, item, result.countedQuantity),
    );
    setStockItems((items) => items.map((stockItem) =>
      stockItem.catalogKey === item.catalogKey
        ? { ...stockItem, stock: result.countedQuantity }
        : stockItem,
    ));
    setStockCounts((current) => [...current, record]);

    // De telling zelf gaat naar de database; lukt dat niet, dan wacht hij.
    const countKey = `count-${crypto.randomUUID()}`;
    const countPayload = {
      locationCode: inventoryLocationCode,
      storageNumber: item.storageNumber,
      countedQuantity: input.countedQuantity,
      notes: input.notes,
      idempotencyKey: countKey,
      actorId,
    };
    void postStockCount(countPayload)
      .then(() => { void refreshSharedState(); })
      .catch((error) => {
        if (error instanceof KeyflowOfflineError) {
          queueWrite({ kind: "stockCount", id: countKey, payload: countPayload });
        } else {
          setLastAction(error instanceof Error ? error.message : "De telling is niet vastgelegd.");
        }
      });

    if (result.difference !== 0) {
      setTransactions((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          occurredAt,
          catalogKey: item.catalogKey,
          storageNumber: item.storageNumber,
          sku: item.sku || `HANGMAP-${String(item.storageNumber).padStart(3, "0")}`,
          model: item.model,
          layout: item.layout,
          type: "adjustment",
          quantityDelta: result.difference,
          reasonCode: result.difference < 0
            ? "cycle_count_shortage"
            : "cycle_count_overage",
          notes: result.notes,
          actor: actorName,
          reference: `TELLING-HANGMAP-${item.storageNumber}`,
        },
      ]);
    }

    setLastAction(
      result.difference === 0
        ? `Hangmap ${item.storageNumber} geteld: voorraad klopt (${result.countedQuantity}).`
        : `Hangmap ${item.storageNumber} geteld: ${formatSigned(result.difference)} gecorrigeerd naar ${result.countedQuantity}.`,
    );
    return record;
  }

  function recordStickerVerification(input: StickerVerificationReportInput) {
    const report: StickerVerificationReport = {
      ...input,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      actor: actorName,
    };
    setVerificationReports((current) => [...current, report]);

    // Een melding die alleen in deze browser staat bereikt management nooit,
    // en dan komt dezelfde fout volgende week gewoon terug.
    const key = `verification-${crypto.randomUUID()}`;
    const payload = { ...input, idempotencyKey: key };
    void postVerificationReport(payload)
      .then(() => { void refreshSharedState(); })
      .catch((error) => {
        if (error instanceof KeyflowOfflineError) {
          queueWrite({ kind: "verificationReport", id: key, payload });
        } else {
          setLastAction(error instanceof Error ? error.message : "De melding is niet vastgelegd.");
        }
      });

    setLastAction(
      report.outcome === "passed"
        ? `Hangmap ${report.storageNumber} gecontroleerd voor ${report.sku}.`
        : `Afwijking bij hangmap ${report.storageNumber}: ${report.sku}.`,
    );
    return report;
  }

  function reviewModelGroup(
    proposal: ModelGroupProposal,
    input: ModelGroupReviewInput,
  ) {
    const decision = createModelGroupDecision(proposal, input, {
      id: crypto.randomUUID(),
      decidedAt: new Date().toISOString(),
      reviewer: actorName,
    });
    setModelGroupDecisions((current) => [...current, decision]);
    const reviewKey = `modelgroup-${crypto.randomUUID()}`;
    const reviewPayload = {
      proposalId: proposal.id,
      status: decision.status,
      manufacturerPartNumber: decision.manufacturerPartNumber,
      photoReference: decision.photoReference,
      notes: decision.notes,
      evidence: decision.evidence,
      excludedModels: decision.excludedModels,
      addedModels: decision.addedModels,
      idempotencyKey: reviewKey,
      actorId,
    };
    void postModelGroupReview(reviewPayload)
      .then(() => { void refreshSharedState(); })
      .catch((error) => {
        if (error instanceof KeyflowOfflineError) {
          queueWrite({ kind: "modelGroupReview", id: reviewKey, payload: reviewPayload });
        } else {
          setLastAction(error instanceof Error ? error.message : "Het besluit is niet vastgelegd.");
        }
      });
    setLastAction(
      `${proposal.proposedName} ${decision.status === "approved" ? "goedgekeurd" : "afgewezen"} door ${decision.reviewer}.`,
    );
    return decision;
  }

  /** Staat deze koppeling al afgekeurd? Dan hoeft de knop er niet meer te staan. */
  function afgekeurdeKoppeling(koppeling: { catalogKey: string; model: string }) {
    return latestCompatibilityEvidence(
      compatibilityEvidenceRecords,
      koppeling.catalogKey,
      koppeling.model,
    )?.status === "rejected";
  }

  /**
   * De koppeling model↔hangmap afkeuren op grond van wat de werkvloer meldde.
   *
   * Geen foto en geen millimeters: die horen bij goedkeuren, waar je een
   * uitspraak doet over alle volgende laptops van dit model. Hier is het bewijs
   * al geleverd — iemand heeft het vel op de echte laptop gelegd. Wat we
   * vastleggen is wat er niet klopte en wie dat besloot.
   */
  function keurKoppelingAf(koppeling: {
    catalogKey: string;
    model: string;
    storageNumber: number;
    reden: string;
  }) {
    try {
      recordCompatibilityEvidence({
        catalogKey: koppeling.catalogKey,
        model: koppeling.model,
        status: "rejected",
        manufacturerPartNumber: "",
        photoReference: "",
        keyboardWidthMm: 0,
        keyboardHeightMm: 0,
        checkpoints: emptyCompatibilityCheckpoints,
        notes: `${koppeling.reden} — gemeld door de werkvloer, bevestigd door ${actorName}.`,
      });
      setLastAction(
        `Hangmap ${koppeling.storageNumber} wordt niet meer aangeraden voor ${koppeling.model}.`,
      );
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Afkeuren is niet gelukt.");
    }
  }

  /**
   * De afkeuring weer intrekken.
   *
   * Bij "toetsvorm of positionering past niet" gaat het afkeuren vanzelf, want
   * dat is een eigenschap van de combinatie en geen misgreep. Maar iemand kan
   * de verkeerde reden hebben aangeklikt, en dan mag één melding een goede
   * combinatie niet voorgoed op slot zetten. De melding zelf blijft staan — die
   * is wat er gebeurd is; alleen de gevolgtrekking gaat weg.
   */
  async function trekAfkeuringIn(koppeling: { catalogKey: string; model: string; storageNumber: number }) {
    try {
      await withdrawCompatibilityRejection(koppeling.catalogKey, koppeling.model);
      await refreshSharedState();
      setLastAction(
        `Hangmap ${koppeling.storageNumber} mag weer geadviseerd worden voor ${koppeling.model}.`,
      );
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Intrekken is niet gelukt.");
    }
  }

  function recordCompatibilityEvidence(input: CompatibilityEvidenceInput) {
    const record = createCompatibilityEvidenceRecord(
      inventoryCatalog,
      input,
      {
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        reviewer: actorName,
      },
    );
    setCompatibilityEvidenceRecords((current) => [...current, record]);
    const evidenceKey = `evidence-${crypto.randomUUID()}`;
    const evidencePayload = { ...input, idempotencyKey: evidenceKey, actorId };
    void postCompatibilityEvidence(evidencePayload)
      .then(() => { void refreshSharedState(); })
      .catch((error) => {
        if (error instanceof KeyflowOfflineError) {
          queueWrite({ kind: "compatibilityEvidence", id: evidenceKey, payload: evidencePayload });
        } else {
          setLastAction(error instanceof Error ? error.message : "Het bewijs is niet vastgelegd.");
        }
      });
    setLastAction(
      `${record.model} · ${record.sku} ${record.status === "approved" ? "fysiek goedgekeurd" : "afgekeurd"} door ${record.reviewer}.`,
    );
    return record;
  }

  async function recordRecoveryDrill(input: RecoveryDrillInput) {
    if (identity.mode === "pilot") {
      const record = createRecoveryDrill(input, {
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        recordedBy: actorName,
      });
      setRecoveryDrills((current) => [...current, record]);
      setLastAction(
        `Herstelproef ${record.backupReference} ${record.result === "passed" ? "geslaagd" : "mislukt"} lokaal vastgelegd.`,
      );
      return record;
    }

    setContinuitySync((current) => ({
      ...current,
      status: "saving",
      message: "Herstelproef wordt met de persoonlijke sessie centraal opgeslagen.",
    }));
    try {
      const response = await fetch("/api/operations/recovery-drills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          idempotencyKey: `recovery-drill:${crypto.randomUUID()}`,
        }),
      });
      if (!response.ok) throw new Error(await responseErrorMessage(response));
      const result = await response.json() as {
        record: RecoveryDrillRecord;
        duplicate: boolean;
      };
      setRecoveryDrills((current) => [
        result.record,
        ...current.filter(({ id }) => id !== result.record.id),
      ]);

      const readinessResponse = await fetch("/api/operations/readiness");
      if (readinessResponse.ok) {
        const centralReadiness = await readinessResponse.json() as ContinuitySyncState["centralReadiness"];
        setContinuitySync({
          mode: "central",
          status: "ready",
          message: "Herstelproef is centraal opgeslagen en de runtimecontrole is vernieuwd.",
          centralReadiness,
        });
      } else {
        setContinuitySync((current) => ({
          ...current,
          mode: "central",
          status: "error",
          message: "De herstelproef is opgeslagen, maar de runtimecontrole kon niet worden vernieuwd.",
        }));
      }
      setLastAction(
        `Herstelproef ${result.record.backupReference} centraal vastgelegd door ${actorName}.`,
      );
      return result.record;
    } catch (error) {
      setContinuitySync((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Centrale herstelregistratie is mislukt.",
      }));
      throw error;
    }
  }

  async function recordGoLiveAcceptance(input: GoLiveAcceptanceInput) {
    if (identity.mode === "pilot") {
      const record = createGoLiveAcceptanceRecord(input, {
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        reviewedBy: actorName,
      });
      setGoLiveAcceptanceRecords((current) => [...current, record]);
      setLastAction(
        `${record.gate} als ${record.decision} in het lokale go-livedossier vastgelegd.`,
      );
      return record;
    }

    setAcceptanceSync((current) => ({
      ...current,
      status: "saving",
      message: "Acceptatiebesluit wordt met de persoonlijke sessie centraal opgeslagen.",
    }));
    try {
      const response = await fetch("/api/operations/go-live-acceptance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          idempotencyKey: `go-live-acceptance:${crypto.randomUUID()}`,
        }),
      });
      if (!response.ok) throw new Error(await responseErrorMessage(response));
      const result = await response.json() as {
        record: GoLiveAcceptanceRecord;
        duplicate: boolean;
      };
      setGoLiveAcceptanceRecords((current) => [
        result.record,
        ...current.filter(({ id }) => id !== result.record.id),
      ]);
      setAcceptanceSync({
        mode: "central",
        status: "ready",
        message: "Acceptatiebesluit is centraal en auditbaar opgeslagen.",
      });
      setLastAction(
        `${result.record.gate} als ${result.record.decision} centraal vastgelegd door ${actorName}.`,
      );
      return result.record;
    } catch (error) {
      setAcceptanceSync((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Centrale acceptatieregistratie is mislukt.",
      }));
      throw error;
    }
  }

  async function recordWorkfloorTrial(input: WorkfloorTrialInput) {
    if (identity.mode === "pilot") {
      const record = createWorkfloorTrialRecord(input, {
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        recordedBy: actorName,
      });
      setWorkfloorTrials((current) => [...current, record]);
      setLastAction(
        `Werkvloerproef ${record.trialReference} als ${record.result} lokaal vastgelegd.`,
      );
      return record;
    }

    setWorkfloorSync((current) => ({
      ...current,
      status: "saving",
      message: "Werkvloerproef wordt met de persoonlijke sessie centraal opgeslagen.",
    }));
    try {
      const response = await fetch("/api/operations/workfloor-trials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          idempotencyKey: `workfloor-trial:${crypto.randomUUID()}`,
        }),
      });
      if (!response.ok) throw new Error(await responseErrorMessage(response));
      const result = await response.json() as {
        record: WorkfloorTrialRecord;
        duplicate: boolean;
      };
      setWorkfloorTrials((current) => [
        result.record,
        ...current.filter(({ id }) => id !== result.record.id),
      ]);
      setWorkfloorSync({
        mode: "central",
        status: "ready",
        message: "Werkvloerproef is centraal en persoonlijk auditbaar opgeslagen.",
      });
      setLastAction(
        `Werkvloerproef ${result.record.trialReference} centraal vastgelegd door ${actorName}.`,
      );
      return result.record;
    } catch (error) {
      setWorkfloorSync((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Centrale registratie van de werkvloerproef is mislukt.",
      }));
      throw error;
    }
  }

  /**
   * Het beleid geldt voor iedereen. Heeft een ander het ondertussen aangepast,
   * dan overschrijven we dat niet stilzwijgend maar tonen we wat er nu staat.
   */
  async function savePolicy(nextPolicy: OperationsPolicy, nextLayouts = directPrintLayouts) {
    const previous = operationsPolicy;
    const previousLayouts = directPrintLayouts;
    setOperationsPolicy(nextPolicy);
    setDirectPrintLayouts(nextLayouts);
    try {
      const result = await putOperationsPolicy({
        policy: nextPolicy,
        directPrintLayouts: nextLayouts,
        expectedVersion: policyVersion,
        actorId,
      });
      setOperationsPolicy(result.policy);
      setDirectPrintLayouts(result.directPrintLayouts);
      setPolicyVersion(result.version);
      setLastAction(`Conversiebeleid bijgewerkt voor iedereen · grens €${result.policy.thresholdEur}`);
    } catch (error) {
      if (error instanceof KeyflowOfflineError) {
        setOperationsPolicy(previous);
        setDirectPrintLayouts(previousLayouts);
        setLastAction("Geen verbinding — het beleid is niet gewijzigd. Probeer het zo opnieuw.");
        return;
      }
      if (error instanceof KeyflowApiError && error.status === 409) {
        await refreshSharedState();
        setLastAction("Iemand anders paste het beleid net aan. De actuele instellingen staan nu in beeld.");
        return;
      }
      setOperationsPolicy(previous);
      setDirectPrintLayouts(previousLayouts);
      setLastAction(error instanceof Error ? error.message : "Het beleid is niet bewaard.");
    }
  }

  function changeCatalogSku(catalogKey: string, sku: string) {
    setSkuOverrides((current) => ({ ...current, [catalogKey]: sku }));
    const payload = { catalogKey, sku, actorId };
    void putSkuOverride(payload).catch((error) => {
      if (error instanceof KeyflowOfflineError) {
        // Eén sleutel per hangmap: een tweede correctie vervangt de eerste.
        queueWrite({ kind: "skuOverride", id: `sku-${catalogKey}`, payload });
      } else {
        setLastAction(error instanceof Error ? error.message : "Het artikelnummer is niet bewaard.");
      }
    });
  }

  async function requestPrintSticker(input: PrintRequestInput) {
    const idempotencyKey = `print-${crypto.randomUUID()}`;
    // Lokaal opbouwen geeft dezelfde regels en meldingen als voorheen, en dient
    // meteen als wat we tonen zolang de server nog niet heeft geantwoord.
    const local = createPrintRequest(input, {
      id: idempotencyKey,
      requestedAt: new Date().toISOString(),
      requestedBy: actorName,
    });
    const payload = {
      model: input.model,
      layout: input.layout,
      variant: input.variant,
      orderReference: input.orderReference,
      quantity: input.quantity ?? 1,
      reason: input.reason,
      idempotencyKey,
      actorId,
    };

    try {
      const { record } = await postPrintRequest(payload);
      setPrintRequests((current) => [...current, record]);
      setSharedStatus("online");
      return record;
    } catch (error) {
      if (!(error instanceof KeyflowOfflineError)) throw error;
      // Noviply ziet hem pas als de verbinding terug is; de medewerker kan door.
      queueWrite({ kind: "printRequest", id: idempotencyKey, payload });
      setPrintRequests((current) => [...current, local]);
      return local;
    }
  }

  /**
   * De laptop gaat apart en wacht op de eerstvolgende ronde. Dit gaat níét
   * naar Noviply: zij printen hem sowieso, en een aanvraag erbij zou hetzelfde
   * vel twee keer laten uitrollen.
   */
  async function waitForPrintRun(input: RunWaitlistInput) {
    /*
     * Een sleutel per handeling, niet per order en ronde. Met die oude sleutel
     * kreeg een tweede laptop van dezelfde order op dezelfde ronde exact
     * dezelfde sleutel, en dan zag de server hem als een dubbele klik: er
     * gebeurde niets, terwijl er wél een tweede laptop apart stond. Nu telt de
     * server het aantal op. Het scherm maakt zichzelf leeg na een geslaagde
     * handeling, dus twee keer klikken op hetzelfde vel kan hier niet.
     */
    const idempotencyKey = `wachtronde-${crypto.randomUUID()}`;
    const payload = { ...input, idempotencyKey };
    try {
      const { record } = await addToRunWaitlist(payload);
      setRunWaitlist((current) => [record, ...current.filter((entry) => entry.id !== record.id)]);
      return record;
    } catch (error) {
      if (!(error instanceof KeyflowOfflineError)) throw error;
      /*
       * Geen verbinding, maar de laptop staat wel apart op de werkbank. Hem
       * hier laten mislukken betekent: hij ligt daar en niemand weet ervan.
       * In de wachtrij, en zodra de verbinding terug is gaat hij alsnog.
       */
      queueWrite({ kind: "runWaitlist", id: idempotencyKey, payload });
      const lokaal = createRunWaitlistEntry(input, actorName, new Date());
      setRunWaitlist((current) => [lokaal, ...current]);
      return lokaal;
    }
  }

  /** Na de ronde: het vel lag er, of het lag er niet en dan gaat het alsnog. */
  async function settleRunWaitlist(id: string, outcome: "collected" | "escalated") {
    try {
      await settleRunWaitlistEntry(id, outcome);
      await refreshSharedState();
      setLastAction(outcome === "collected"
        ? "Opgehaald bij de printronde."
        : "Alsnog aangevraagd bij Noviply.");
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Dat is niet gelukt.");
    }
  }

  /* ---------- de dagelijkse printrondes ---------- */

  async function uploadBatch(file: File) {
    const result = await uploadPrintBatch(file);
    await refreshSharedState();
    return result;
  }

  async function settleBatchRowRecord(
    rowId: string,
    status: "printed" | "not_printable",
    note: string,
    reason: UnavailableReason,
  ) {
    await settleBatchRow(rowId, status, note, reason);
    await refreshSharedState();
  }

  /** Een verkeerde klik terugdraaien: de regel staat weer open. */
  async function reopenBatchRowRecord(rowId: string) {
    try {
      await reopenBatchRow(rowId);
      await refreshSharedState();
      setLastAction(engelsScherm
        ? "The line is open again."
        : "De regel staat weer open.");
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Terugdraaien is niet gelukt.");
    }
  }

  async function settleBatch(batchId: string) {
    try {
      const { settled } = await settleWholePrintBatch(batchId);
      await refreshSharedState();
      setLastAction(engelsScherm
        ? `${settled} ${settled === 1 ? "line" : "lines"} of the run marked as printed.`
        : `${settled} ${settled === 1 ? "regel" : "regels"} van de ronde op geprint gezet.`);
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Dat is niet gelukt.");
    }
  }

  async function resolveFault(id: string) {
    try {
      await resolveErrorEvent(id);
      setOpenErrors((current) => current.filter((fault) => fault.id !== id));
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Dat is niet gelukt.");
    }
  }

  async function removeBatch(batchId: string) {
    try {
      await removePrintBatch(batchId);
      await refreshSharedState();
      setLastAction(engelsScherm
        ? "Run removed from the list. Anything already ticked off stays in the history."
        : "Ronde uit de lijst gehaald; wat al is afgevinkt blijft in de geschiedenis staan.");
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Dat is niet gelukt.");
    }
  }

  function batchSeen(batchId: string) {
    // Openen is gezien; de melding mag weg zonder dat het scherm wacht.
    void markPrintBatchSeen(batchId)
      .then(() => setPrintBatches((current) => current.map((batch) => batch.id === batchId
        ? { ...batch, seenAt: new Date().toISOString() }
        : batch)))
      .catch(() => undefined);
  }

  async function requestPrinterCheck() {
    try {
      const { check, alreadyOpen } = await askPrinterCheck("");
      setPrinterChecks((current) => [check, ...current.filter((item) => item.id !== check.id)]);
      setLastAction(alreadyOpen
        ? (engelsScherm
          ? "A question was already open with the floor."
          : "Er stond al een vraag open bij de werkvloer.")
        : (engelsScherm
          ? "Asked the floor whether the printer is ready."
          : "Gevraagd aan de werkvloer of de printer klaarstaat."));
    } catch (error) {
      setLastAction(error instanceof Error
        ? error.message
        : (engelsScherm ? "The question could not be sent." : "De vraag kon niet worden gesteld."));
    }
  }

  /**
   * Geeft terug wat er gebeurd is, in plaats van het alleen in de statusregel
   * onderaan te zetten. De medewerker drukt bovenin op een knop; dan hoort het
   * antwoord daar te verschijnen en niet ergens anders op de pagina.
   */
  async function remindNoviply(): Promise<"verstuurd" | "stond-al-open"> {
    const { alreadySent } = await sendPrintReminder();
    await refreshSharedState();
    setLastAction(alreadySent
      ? "Noviply had dit seintje al gekregen."
      : "Noviply heeft een seintje gekregen over de wachtrij.");
    return alreadySent ? "stond-al-open" : "verstuurd";
  }

  async function seenReminder(id: string) {
    await acknowledgePrintReminder(id).catch(() => undefined);
    await refreshSharedState();
  }

  async function startPrinting(id: string) {
    try {
      await closePrinterCheck(id);
      await refreshSharedState();
      setLastAction(engelsScherm
        ? "The floor has been told you are printing now."
        : "Doorgegeven dat Noviply is gaan printen.");
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Dat is niet gelukt.");
    }
  }

  async function replyPrinterCheck(id: string, status: "ready" | "blocked", note: string) {
    const { check } = await answerPrinterCheck(id, status, note);
    setPrinterChecks((current) => current.map((item) => (item.id === check.id ? check : item)));
    setLastAction(status === "ready"
      ? "Doorgegeven aan Noviply: de printer staat klaar."
      : "Doorgegeven aan Noviply: de printer staat niet klaar.");
  }

  function recordConversion(input: ConversionLogInput) {
    const idempotencyKey = `conversion-${crypto.randomUUID()}`;
    const entry = createConversionLogEntry(input, {
      id: idempotencyKey,
      occurredAt: new Date().toISOString(),
      actor: actorName,
    });
    const payload = {
      method: input.method,
      status: input.status,
      model: input.model,
      targetLayout: input.targetLayout,
      variant: input.variant ?? "",
      sku: input.sku ?? "",
      storageNumber: input.storageNumber ?? null,
      orderReference: input.orderReference ?? "",
      quantity: input.quantity ?? 1,
      fellBackFrom: input.fellBackFrom ?? null,
      idempotencyKey,
      actorId,
    };

    // Het logboek mag de medewerker nooit ophouden: direct tonen, op de
    // achtergrond versturen, en bij een storing in de wachtrij.
    setConversionLog((current) => [...current, entry]);
    void postConversion(payload).catch((error) => {
      if (error instanceof KeyflowOfflineError) {
        queueWrite({ kind: "conversion", id: idempotencyKey, payload });
      } else {
        setLastAction("De conversie kon niet worden vastgelegd in de database.");
      }
    });
    return entry;
  }

  /**
   * Een aanvraag terugtrekken die verkeerd is ingevoerd. Bewust niet in de
   * offline-wachtrij: dit is een race tegen Noviply's printer, en een intrekking
   * die pas morgen aankomt heeft geen zin. Zonder verbinding hoort er te staan
   * dat het niet gelukt is, zodat iemand kan bellen.
   */
  async function cancelPrintRequestRecord(record: PrintRequestRecord) {
    try {
      const { record: bijgewerkt } = await cancelPrintRequest(record.id, { actorId });
      setPrintRequests((current) =>
        current.map((item) => (item.id === bijgewerkt.id ? bijgewerkt : item)));
      await refreshSharedState();
      setLastAction(`Aanvraag ${record.orderReference || record.model} is ingetrokken.`);
    } catch (error) {
      setLastAction(error instanceof Error ? error.message : "Intrekken is niet gelukt.");
      throw error;
    }
  }

  /** Noviply heeft het model alsnog: de blokkade eraf en het advies mag weer. */
  function allowNoviplyAgain(id: string) {
    const vorige = noviplyUnavailable;
    setNoviplyUnavailable((current) => current.filter((regel) => regel.id !== id));
    void removeNoviplyUnavailable({ id, actorId }).catch((error) => {
      setNoviplyUnavailable(vorige);
      setLastAction(error instanceof Error ? error.message : "De blokkade is niet weggehaald.");
    });
  }

  async function settlePrintRequestRecord(
    record: PrintRequestRecord,
    status: Exclude<PrintRequestStatus, "requested">,
    note: string,
    unavailableReason: UnavailableReason = "temporary",
  ) {
    // Dezelfde controle als op de server, maar met een melding die Noviply
    // begrijpt voordat het verzoek de deur uit gaat.
    const settled = settlePrintRequest(record, status, note, {
      handledAt: new Date().toISOString(),
      handledBy: actorName,
    });
    const payload = { status, note, unavailableReason, actorId };

    try {
      const result = await patchPrintRequest(record.id, payload);
      setPrintRequests((current) =>
        current.map((item) => (item.id === result.record.id ? result.record : item)));
      // Meldt Noviply dat ze het model niet hebben, dan telt dat meteen mee in
      // het advies — niet pas na de volgende ronde van twintig seconden.
      if (status === "not_printable" && reasonBlocksFuture(unavailableReason)) {
        void fetchNoviplyUnavailable()
          .then((lijst) => setNoviplyUnavailable(lijst))
          .catch(() => undefined);
      }
      setSharedStatus("online");
      if (result.alreadySettled) {
        setLastAction(`${record.model} was al afgehandeld door ${result.record.handledBy ?? "iemand anders"}.`);
      }
    } catch (error) {
      if (!(error instanceof KeyflowOfflineError)) throw error;
      queueWrite({ kind: "settlePrintRequest", id: `settle-${record.id}`, requestId: record.id, payload });
      setPrintRequests((current) =>
        current.map((item) => (item.id === settled.id ? settled : item)));
    }
  }

  /**
   * Welke rol de server ons toekent. De browser kan dit niet zelf bepalen: de
   * knoppen hieronder verbergen alleen wat toch al geweigerd zou worden.
   */
  const [unlockedRole, setUnlockedRole] = useState<UserRole>("employee");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [accounts, setAccounts] = useState<PilotAccount[]>([]);
  const [chosenAccount, setChosenAccount] = useState<string>("");
  const [unlockCode, setUnlockCode] = useState("");
  const [signedInName, setSignedInName] = useState("");
  const [signedInUserId, setSignedInUserId] = useState("");
  // Een code die iemand anders bedacht en die blijft staan, is geen code.
  const [mustChangePin, setMustChangePin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPinAgain, setNewPinAgain] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!demoAccess) return;
    void fetchAccessRole()
      .then((access) => {
        setUnlockedRole(access.role);
        // Terug naar het scherm dat openstond, maar alleen als de server die
        // rol ook toestaat — de voorkeur mag nooit meer openen dan het recht.
        const bewaard = leesLaatsteScherm();
        const magTerug = bewaard?.rol === "noviply"
          ? access.role !== "employee"
          : bewaard?.rol === "management"
            ? access.role === "management"
            : bewaard?.rol === "employee";
        setRole(magTerug && bewaard ? bewaard.rol : access.role);
        if (magTerug && bewaard?.tabblad) {
          if (bewaard.rol === "noviply" && isNoviplyTab(bewaard.tabblad)) {
            setNoviplyTab(bewaard.tabblad);
          }
        }
        setSignedInUserId(access.userId);
        setAccounts(access.accounts);
        setSignedInName(access.accounts.find((a) => a.id === access.userId)?.name ?? "");
        setChosenAccount((current) => current || access.accounts[0]?.id || "");
      })
      .catch(() => setUnlockedRole("employee"));
  }, [demoAccess]);

  async function submitUnlock() {
    if (!chosenAccount || unlockCode.trim().length !== 4) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const result = await signInWithPin(chosenAccount, unlockCode);
      setUnlockedRole(result.role);
      setRole(result.role);
      onthoudScherm(result.role);
      setSignedInName(result.name);
      setSignedInUserId(result.userId);
      setActiveView("overview");
      if (result.mustChangePin) {
        // Wel binnen, maar het venster blijft staan: eerst een eigen pincode.
        setMustChangePin(true);
      } else {
        setUnlockOpen(false);
        setUnlockCode("");
      }
      await refreshSharedState();
    } catch (error) {
      setUnlockError(error instanceof KeyflowApiError
        ? error.message
        : "Er is geen verbinding om de code te controleren.");
    } finally {
      setUnlocking(false);
    }
  }

  async function submitNewPin() {
    if (newPin !== newPinAgain) {
      setUnlockError("De twee pincodes zijn niet gelijk.");
      return;
    }
    setUnlocking(true);
    setUnlockError("");
    try {
      await changeOwnPin(unlockCode, newPin);
      setMustChangePin(false);
      setUnlockOpen(false);
      setUnlockCode("");
      setNewPin("");
      setNewPinAgain("");
      setLastAction("Je eigen pincode is ingesteld.");
    } catch (error) {
      setUnlockError(error instanceof KeyflowApiError
        ? error.message
        : "De pincode kon niet worden gewijzigd.");
    } finally {
      setUnlocking(false);
    }
  }

  /**
   * Onthouden welk scherm iemand openhad.
   *
   * Michael staat bij Noviply de hele dag op zijn eigen scherm. Ververste hij
   * de pagina, dan stond hij ineens weer in het beheerscherm van ReMarkt en
   * moest hij zelf terugklikken — elke keer opnieuw. De rol staat in de
   * sessie van de server, maar wélk van de toegestane schermen je open had is
   * een voorkeur van dit apparaat, dus die hoort hier.
   *
   * Alleen een voorkeur: wat je mag blijft de server bepalen. Zet iemand hier
   * met de hand "management" neer zonder de rechten, dan wint de controle
   * hieronder en gebeurt er niets.
   */
  function onthoudScherm(rol: UserRole, tabblad?: string) {
    try {
      window.localStorage.setItem(LAATSTE_SCHERM_KEY, JSON.stringify({ rol, tabblad: tabblad ?? "" }));
    } catch {
      // Privémodus of een volle opslag; dan onthouden we het gewoon niet.
    }
  }

  async function lockOut() {
    await lockAccess().catch(() => undefined);
    try { window.localStorage.removeItem(LAATSTE_SCHERM_KEY); } catch { /* zie boven */ }
    setUnlockedRole("employee");
    setRole("employee");
    setSignedInName("");
    setUnlockCode("");
    setMustChangePin(false);
    setActiveView("overview");
    await refreshSharedState();
  }

  function switchRole(nextRole: UserRole) {
    if (!demoAccess) return;
    // Alleen naar een rol die de server ook werkelijk toestaat.
    if (nextRole === "management" && unlockedRole !== "management") return;
    if (nextRole === "noviply" && unlockedRole === "employee") return;
    setRole(nextRole);
    onthoudScherm(nextRole);
    setActiveView("overview");
    setQuery("");
    setMutation(null);
  }

  function exportPilotBackup() {
    const existingLocalState = identity.mode === "entra"
      ? readOperationsState(window.localStorage)
      : null;
    const locallyStoredRecoveryDrills =
      existingLocalState?.success && existingLocalState.state
        ? existingLocalState.state.recoveryDrills
        : [];
    const locallyStoredGoLiveAcceptanceRecords =
      existingLocalState?.success && existingLocalState.state
        ? existingLocalState.state.goLiveAcceptanceRecords
        : [];
    const locallyStoredWorkfloorTrials =
      existingLocalState?.success && existingLocalState.state
        ? existingLocalState.state.workfloorTrials
        : [];
    const snapshot = createOperationsSnapshot({
      catalogQuantities,
      transactions,
      operationsPolicy,
      verificationReports,
      stockCounts,
      modelGroupDecisions,
      compatibilityEvidenceRecords,
      recoveryDrills: identity.mode === "pilot"
        ? recoveryDrills
        : locallyStoredRecoveryDrills,
      goLiveAcceptanceRecords: identity.mode === "pilot"
        ? goLiveAcceptanceRecords
        : locallyStoredGoLiveAcceptanceRecords,
      workfloorTrials: identity.mode === "pilot"
        ? workfloorTrials
        : locallyStoredWorkfloorTrials,
      printRequests,
      skuOverrides,
      conversionLog,
    });
    const blob = new Blob([serializeOperationsSnapshot(snapshot)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rekey-backup-${snapshot.savedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setLastAction("Lokale ReKey-back-up gedownload.");
  }


  return (
    <div className="app-shell">
      {/* Een scherm dat omvalt meldt zichzelf; anders hoor je het pas als
          iemand belt dat het niet meer werkt. */}
      <ErrorReporter role={role} />
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div><strong>ReKey</strong><span>Keyboard Operations</span></div>
        </div>
        <nav aria-label="Hoofdnavigatie">
          {/* Noviply is een partner met twee taken; die staan als eigen
              bestemmingen in de zijbalk in plaats van als tabbladen. */}
          {role === "noviply" && ([
            {
              id: "runs" as const,
              // Het puntje verdwijnt zodra ze de ronde hebben geopend.
              label: unseenBatches(printBatches).length > 0 ? "Print runs •" : "Print runs",
              icon: "upload" as const,
            },
            { id: "orders" as const, label: "Print requests", icon: "orders" as const },
            // Wat zij zelf hebben gemeld als "kunnen wij niet", zodat ze het ook
            // zelf weer kunnen vrijgeven.
            {
              id: "blocked" as const,
              // Het getal telt wat het advies stilzet, niet wat er ooit een
              // keer misging: dat laatste is geschiedenis en vraagt niets.
              label: noviplyUnavailable.length > 0
                ? `Cannot print · ${noviplyUnavailable.length}`
                : "Cannot print",
              icon: "alert" as const,
            },
            { id: "history" as const, label: "History", icon: "reports" as const },
            {
              id: "stock" as const,
              label: resupplyStarted ? "Stock running low" : "Stock",
              icon: "stock" as const,
            },
          ]).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${noviplyTab === item.id ? "active" : ""}`}
              onClick={() => { setNoviplyTab(item.id); onthoudScherm("noviply", item.id); }}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          {role !== "noviply" && (role === "management"
            // Instellingen staat bewust apart onder de vier dagelijkse
            // tabbladen: het is waar je de regels zet, niet waar je werkt.
            ? [...navItems, settingsNavItem, ...(showParked ? parkedNavItems : [])]
              // Het aantal dringende punten hoort in het menu: dan zie je vanaf
              // elk scherm of er iemand op je staat te wachten.
              .map((item) => (item.id === "attention" && dringend > 0
                ? { ...item, label: `Aandacht nodig · ${dringend}` }
                : item))
            : [{ id: "overview" as const, label: "Uitvoering", icon: "convert" as const }]
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? "active" : ""}`}
              onClick={() => setActiveView(item.id)}
            >
              <Icon name={item.icon} /><span>{item.label}</span>
            </button>
          ))}
          {role === "management" && (
            <button
              className="nav-item nav-more"
              aria-expanded={showParked}
              onClick={() => {
                const next = !showParked;
                setShowParked(next);
                if (!next && parkedNavItems.some((item) => item.id === activeView)) {
                  setActiveView("overview");
                }
              }}
            >
              <Icon name="settings" />
              <span>{showParked ? "Minder tonen" : "Meer beheer"}</span>
            </button>
          )}
        </nav>
        <div className="sidebar-footer">
          {/* Naslag hoort bij de navigatie, niet boven het werk: het is niets
              wat je elke dag opent, en het nam een hele band in beslag. */}
          {role === "noviply" && (
            <a
              className="nav-item"
              href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/docs/rekey-handbook-noviply.pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="book" /><span>Handbook</span>
            </a>
          )}
          {/* Voor management is dit toegangsbeheer. Voor de werkvloer stond hier
              "Hulp" met een knop die niets deed; die opent nu de vier niveaus
              met foto, zodat je ook zonder laptop in je handen kunt opzoeken
              wat een sticker van twee sterren nou eigenlijk is. */}
          <button
            className="nav-item"
            onClick={() => (role === "management" ? setAccessOpen(true) : setNiveausOpen(true))}
          >
            <Icon name="settings" /><span>{role === "management" ? "Toegangsbeheer" : "Hulp"}</span>
          </button>
          <div className="profile">
            <div className="avatar">{actorInitials}</div>
            <div><strong>{actorName}</strong><span>{role === "management" ? "Management" : role === "noviply" ? "Partner" : "Uitvoering"}</span></div>
            <button
              aria-label={onSignOut ? "Afmelden" : "Profielmenu"}
              onClick={onSignOut}
              title={onSignOut ? "Afmelden" : "Pilotprofiel"}
            >{onSignOut ? "↗" : "•••"}</button>
          </div>
        </div>
      </aside>

      {/* De werkvloer krijgt een compactere kop: daar moet het hele scherm
          zonder scrollen passen, en de titel hoeft niet even groot te zijn als
          op een beheerscherm waar je toch al leest. */}
      <main className={`main${role === "employee" ? " main-werkvloer" : ""}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{headerDate}</p>
            <h1>{role === "employee"
              ? "Uitvoering keyboardconversies"
              : role === "noviply"
                ? noviplyHeading(noviplyTab).title
                : viewHeadings[activeView].title}</h1>
            <p>{role === "employee"
              ? "Eén duidelijke taak tegelijk, met automatisch methodeadvies."
              : role === "noviply"
                ? noviplyHeading(noviplyTab).subtitle
                : viewHeadings[activeView].subtitle}</p>
          </div>
          <div className="top-actions">
            {demoAccess ? (
              unlockedRole === "employee" ? (
                <button className="sign-in-chip" onClick={() => setUnlockOpen(true)}>
                  <Icon name="lock" size={15} />
                  <span>Aanmelden</span>
                </button>
              ) : (
                <div className="session-bar">
                  <div className="role-tabs" role="group" aria-label="Scherm kiezen">
                    <button className={role === "employee" ? "active" : ""} onClick={() => switchRole("employee")}>
                      Werkvloer
                    </button>
                    {/* Management ziet ook het Noviply-scherm; Noviply alleen zichzelf. */}
                    <button className={role === "noviply" ? "active" : ""} onClick={() => switchRole("noviply")}>
                      Noviply
                    </button>
                    {unlockedRole === "management" && (
                      <button className={role === "management" ? "active" : ""} onClick={() => switchRole("management")}>
                        Management
                      </button>
                    )}
                  </div>
                  <div className="session-user">
                    <Icon name="user" size={15} />
                    <span>
                      <strong>{signedInName || roleLabel(unlockedRole)}</strong>
                      <small>{roleLabel(unlockedRole)}</small>
                    </span>
                    {/* Noviply leest Engels. Eén Nederlands woord in een verder
                        Engels scherm is precies het soort ding waar iemand op
                        blijft haken. */}
                    <button
                      onClick={() => void lockOut()}
                      title={role === "noviply" ? "Sign out" : "Afmelden"}
                      aria-label={role === "noviply" ? "Sign out" : "Afmelden"}
                    >
                      {role === "noviply" ? "Sign out" : "Afmelden"}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <div className="identity-badge">
                <span>MICROSOFT ENTRA ID</span>
                <strong>{roleLabel(role)}</strong>
              </div>
            )}
            {role === "management" && <label className="global-search">
              <span className="sr-only">Zoeken</span>
              <Icon name="scan" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => activeView !== "inventory" && setActiveView("inventory")}
                placeholder="Scan of zoek model, SKU…"
              />
              <kbd>/</kbd>
            </label>}
            <button
              className="icon-button"
              aria-label={theme === "dark" ? "Naar lichte weergave" : "Naar donkere weergave"}
              title={theme === "dark" ? "Lichte weergave" : "Donkere weergave"}
              onClick={toggleTheme}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <button className="icon-button" aria-label="Meldingen"><Icon name="alert" /><span className="notification-dot" /></button>
          </div>
        </header>

        {role === "noviply" && (
          <NoviplyWorkspace
            tab={noviplyTab}
            printRequests={printRequests}
            quantities={catalogQuantities}
            transactions={transactions}
            printerChecks={printerChecks}
            resupplyLeadTimeDays={operationsPolicy.resupplyLeadTimeDays}
            resupplySafetyWeeks={operationsPolicy.resupplySafetyWeeks}
            onAskPrinterCheck={() => void requestPrinterCheck()}
            onStartPrinting={(id: string) => void startPrinting(id)}
            onSettlePrintRequest={settlePrintRequestRecord}
            printBatches={printBatches}
            onUploadBatch={uploadBatch}
            onSettleBatchRow={settleBatchRowRecord}
            onReopenBatchRow={reopenBatchRowRecord}
            noviplyUnavailable={noviplyUnavailable}
            onAllowAgain={allowNoviplyAgain}
            verificationReports={verificationReports}
            onSettleBatch={settleBatch}
            onBatchSeen={batchSeen}
            onOpenRuns={() => { setNoviplyTab("runs"); onthoudScherm("noviply", "runs"); }}
            onRemoveBatch={removeBatch}
          />
        )}

        {role === "employee" && (
          <EmployeeWorkspace
            directPrintLayouts={directPrintLayouts}
            printRequests={printRequests}
            printerChecks={printerChecks}
            onRemindNoviply={remindNoviply}
            onRequestPrintSticker={requestPrintSticker}
            runWaitlist={runWaitlist}
            printBatches={printBatches}
            noviplyUnavailable={noviplyUnavailable}
            onWaitForPrintRun={waitForPrintRun}
            onCancelPrintRequest={cancelPrintRequestRecord}
            onSettleRunWait={(id, outcome) => void settleRunWaitlist(id, outcome)}
            onRecordConversion={recordConversion}
            catalog={workingCatalog}
            actorName={actorName}
            orders={[]}
            quantities={catalogQuantities}
            policy={operationsPolicy}
            compatibilityEvidenceRecords={compatibilityEvidenceRecords}
            onInventoryMutation={recordEmployeeInventoryMutation}
            onStickerVerification={recordStickerVerification}
          />
        )}

        {role === "management" && activeView === "attention" && (
          attention.length > 0 ? (
            /* Geen eigen kop meer: de pagina heet al "Aandacht nodig" en zegt
               er dezelfde zin bij. Het aantal staat nu in het menu, waar je het
               ook ziet als je ergens anders bent. */
            <section className="panel problems-panel attention-panel">
              {/* Een balk met wat er ligt en de knop om het mee te nemen. Deze
                  lijst wordt ook buiten ReKey gebruikt — doorsturen naar iemand
                  die er niet in werkt, of uitsplitsen in Excel — en overtypen is
                  werk dat fouten maakt. */}
              <div className="attention-balk">
                <span>
                  <b>{attention.length}</b> {attention.length === 1 ? "punt" : "punten"}
                  {dringend > 0 && <em> · {dringend} nu oppakken</em>}
                </span>
                <div className="attention-balk-acties">
                  <span className="attention-live">
                    Werkt zichzelf bij — laatst gekeken {lastSyncedAt ? formatPersistenceTime(lastSyncedAt) : "zojuist"}
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      downloadTekstbestand(
                        createAttentionCsv(attention),
                        attentionExportFilename(new Date().toISOString()),
                      );
                      setLastAction(`${attention.length} punten geëxporteerd.`);
                    }}
                  >
                    Download voor Excel
                  </button>
                </div>
              </div>
              {/* Twee blokken in plaats van één lijst: bij het bovenste staat er
                  nu iemand met een laptop stil, bij het onderste merk je het pas
                  bij de volgende laptop van dat model. Een teamleider hoeft dan
                  niet zelf te wegen wat zwaarder telt. */}
              {splitAttention(attention).nu.length > 0 && (
                <p className="attention-kop nu">
                  Nu oppakken — hier staat iemand op te wachten
                </p>
              )}
              <AttentionGroups
                items={splitAttention(attention).nu}
                noviplyUnavailable={noviplyUnavailable}
                metActies
                onAllowAgain={allowNoviplyAgain}
                onRejectPairing={keurKoppelingAf}
                onWithdrawRejection={(koppeling) => void trekAfkeuringIn(koppeling)}
                isRejected={afgekeurdeKoppeling}
                formatMoment={formatPersistenceTime}
              />

              {splitAttention(attention).later.length > 0 && (
                <>
                  <p className="attention-kop later">Zodra het uitkomt</p>
                  <AttentionGroups
                    items={splitAttention(attention).later}
                    noviplyUnavailable={noviplyUnavailable}
                    formatMoment={formatPersistenceTime}
                  />
                </>
              )}
            </section>
          ) : (
              <section className="panel">
                <div className="empty">
                  Niets dat aandacht vraagt. Zodra een vel niet past, Noviply iets niet
                  kan printen of een hangmap leegloopt, staat het hier.
                </div>
              </section>
            )
        )}

        {role === "management" && activeView === "overview" && (
          <>
        {/* De werkdruk staat op het dashboard omdat je hem 's ochtends omzet als
            je ziet hoe vol het is — niet op een instellingenscherm dat je twee
            keer per maand opent. Wat hij doet staat erbij: de grens waarboven
            een laptop de toetsenbordsprint krijgt schuift mee. Rustig is die
            grens lager en gaan er meer door de printer; druk is hij hoger en
            schuift het werk naar de kast en naar Noviply. */}
        <section className="werkdruk-balk" aria-label="Werkdruk">
          <div className="werkdruk-uitleg">
            <span>WERKDRUK VANDAAG</span>
            <strong>
              Toetsenbordsprint vanaf €{effectiveThreshold(operationsPolicy.thresholdEur, operationsPolicy.workload)}
            </strong>
            <small>
              {operationsPolicy.workload === "normal"
                ? `De ingestelde grens van €${operationsPolicy.thresholdEur}.`
                : `Ingesteld op €${operationsPolicy.thresholdEur}; de werkdruk schuift hem ${
                  workloadThresholdShift[operationsPolicy.workload] > 0 ? "omhoog" : "omlaag"
                }.`}
            </small>
          </div>
          <div className="werkdruk-keuze" role="group" aria-label="Werkdruk kiezen">
            {(["quiet", "normal", "busy", "critical"] as const).map((stand) => (
              <button
                key={stand}
                type="button"
                className={stand === operationsPolicy.workload ? "active" : ""}
                aria-pressed={stand === operationsPolicy.workload}
                onClick={() => {
                  if (stand === operationsPolicy.workload) return;
                  void savePolicy({ ...operationsPolicy, workload: stand });
                }}
              >
                <b>{workloadLabel[stand]}</b>
                <small>
                  €{effectiveThreshold(operationsPolicy.thresholdEur, stand)}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="quick-actions" aria-label="Snelle acties">
          <button className="action-card issue" onClick={() => setMutation({ mode: "issue", item: defaultItem })}>
            <span className="action-icon"><Icon name="minus" size={26} /></span>
            <span><strong>Snel afboeken</strong><small>Scan SKU en boek direct −1</small></span>
            <Icon name="arrow" />
          </button>
          <button className="action-card receive" onClick={() => setMutation({ mode: "receipt", item: defaultItem })}>
            <span className="action-icon"><Icon name="plus" size={26} /></span>
            <span><strong>Voorraad ontvangen</strong><small>Levering of retour registreren</small></span>
            <Icon name="arrow" />
          </button>
          <button className="action-card conversion" onClick={() => setAdvisorOpen(true)}>
            <span className="action-icon"><Icon name="convert" size={26} /></span>
            <span><strong>Nieuwe conversie</strong><small>Vind de beste methode voor een laptop</small></span>
            <Icon name="arrow" />
          </button>
          <button className="action-card" onClick={() => setAddSheetOpen(true)}>
            <span className="action-icon"><Icon name="plus" size={26} /></span>
            <span><strong>Stickervel toevoegen</strong><small>Nieuw model dat nog geen hangmap heeft</small></span>
            <Icon name="arrow" />
          </button>
          <button className="action-card import" onClick={() => setImportOpen(true)}>
            <span className="action-icon"><Icon name="upload" size={26} /></span>
            <span><strong>Excel importeren</strong><small>Controleer voorraad zonder direct te boeken</small></span>
            <Icon name="arrow" />
          </button>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <div><span>Totale voorraad</span><strong>{currentCatalogStock.toLocaleString("nl-NL")}</strong><small>stickervellen in {inventoryCatalogSummary.rowCount} genummerde hangmappen</small></div>
            <div className="stat-glyph stock"><Icon name="stock" size={27} /></div>
          </article>
          <article className="stat-card urgent">
            <div><span>Lege hangmappen</span><strong>{emptyFolderCount}</strong><small>van {inventoryCatalogSummary.operationalRows} bruikbare hangmappen</small></div>
            <div className="stat-glyph"><Icon name="alert" size={27} /></div>
          </article>
          <article className="stat-card">
            <div><span>Vandaag verbruikt</span><strong>{todayIssued}</strong><small>automatisch en handmatig afgeboekt</small></div>
            <div className="stat-glyph chart"><Icon name="reports" size={27} /></div>
          </article>
          <article className="stat-card">
            <div><span>Wacht op Noviply</span><strong>{awaitingPrintCount}</strong><small>aangevraagd, nog niet geprint</small></div>
            <div className="stat-glyph convert"><Icon name="convert" size={27} /></div>
          </article>
        </section>

        {/* Wat er vandaag is gedaan, en waarmee. Eén balk in plaats van vier
            getallen: de verhouding is de vraag, niet het losse aantal. De naam
            staat bij elk stukje, dus de kleur hoeft het niet alleen te doen. */}
        {vandaagPerMethode.totaal > 0 && (
          <section className="panel today-panel">
            <div className="today-head">
              <div>
                <h2>Vandaag afgehandeld</h2>
                <p>{vandaagPerMethode.totaal} {vandaagPerMethode.totaal === 1 ? "laptop" : "laptops"}, verdeeld over de methodes</p>
              </div>
            </div>
            <div className="today-bar" role="img" aria-label={vandaagPerMethode.regels.map((r) => `${r.naam}: ${r.aantal}`).join(", ")}>
              {vandaagPerMethode.regels.map((regel) => (
                <span
                  key={regel.method}
                  className={`today-slice tone-${regel.toon}`}
                  style={{ flexGrow: regel.aantal }}
                  title={`${regel.naam}: ${regel.aantal}`}
                />
              ))}
            </div>
            <ul className="today-legend">
              {vandaagPerMethode.regels.map((regel) => (
                <li key={regel.method}>
                  <i className={`tone-${regel.toon}`} />
                  <strong>{regel.aantal}</strong>
                  <span>{regel.naam}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="content-grid">
          {/* Problemen ontstonden op vier plekken en werden op vier plekken
              bewaard: een vel dat niet paste hier, wat Noviply niet kon printen
              in hun lijst, een lege hangmap alleen in de voorraad, en een
              onbekende taalcode boven een printronde. Wie moest weten wat er
              vandaag misloopt had vier schermen nodig. */}
          {/* Een kapotte route of een scherm dat omvalt hoort hier te staan en
              niet in een console die niemand leest. Apart van de rest: dit is
              geen werkprobleem maar een storing. */}
          {openErrors.length > 0 && (
            <section className="panel problems-panel faults-panel">
              <div className="panel-heading">
                <div>
                  <h2>Storingen</h2>
                  <p>Iets ging technisch mis. Meld dit als het blijft terugkomen.</p>
                </div>
                <span className="problems-count">{openErrors.length}</span>
              </div>
              <ul className="fault-list">
                {openErrors.slice(0, 6).map((fault) => (
                  <li key={fault.id}>
                    <div>
                      <strong>{fault.message}</strong>
                      <span>
                        {fault.source === "browser" ? "Scherm" : "Server"}
                        {fault.origin && ` · ${fault.origin}`}
                        {fault.occurrences > 1 && ` · ${fault.occurrences}×`}
                      </span>
                      <small>Laatst {formatPersistenceTime(fault.lastSeenAt)}</small>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void resolveFault(fault.id)}
                    >
                      Afgehandeld
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}


          {/* Op het dashboard alleen nog hoeveel er ligt en wat het zwaarste
              is. De volledige lijst staat op een eigen pagina: hij groeide hier
              uit tot een muur van meldingen die de rest wegdrukte, terwijl je
              er meestal even doorheen loopt en dan verder gaat. */}
          {attention.length > 0 && (
            <section className="panel attention-kort">
              <div>
                <span className="attention-kort-getal">{attention.length}</span>
                <div>
                  <strong>
                    {splitAttention(attention).nu.length > 0
                      ? `${splitAttention(attention).nu.length} vragen er nu om`
                      : "Niets dat nu iemand ophoudt"}
                  </strong>
                  <small>
                    {splitAttention(attention).nu.length > 0
                      ? splitAttention(attention).nu[0].title
                      : `${attention.length} ${attention.length === 1 ? "punt" : "punten"} voor zodra het uitkomt`}
                  </small>
                </div>
              </div>
              <button type="button" className="secondary-button" onClick={() => setActiveView("attention")}>
                Bekijken
              </button>
            </section>
          )}

          <section className="panel stock-panel">
            <div className="panel-heading">
              <div><h2>Laagste voorraad</h2><p>De acht hangmappen met de minste vellen</p></div>
              <button onClick={() => setActiveView("inventory")}>Bekijk volledige catalogus <Icon name="arrow" size={16} /></button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Model / SKU</th><th>Layout</th><th>Voorraad</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredStock.map((item) => (
                    <tr key={item.sku}>
                      <td><strong>{item.model}</strong><span>{item.sku}</span></td>
                      <td data-label="Layout"><span className="layout-badge">{item.layout}</span></td>
                      <td data-label="Voorraad">
                        <b className={item.stock === 0 ? "zero" : ""}>{item.stock}</b>
                        <span>{item.threshold === null ? "minimum nog niet bekend" : ` / min. ${item.threshold}`}</span>
                      </td>
                      <td data-label="Status">
                        {item.stock === 0
                          ? <span className="status critical">Leeg</span>
                          : item.threshold !== null && item.stock < item.threshold
                            ? <span className="status low">Onder minimum</span>
                            : <span className="status neutral">—</span>}
                      </td>
                      <td><button className="row-action" onClick={() => setMutation({ mode: "receipt", item })}>Voorraad</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStock.length === 0 && <div className="empty">Geen aandachtspunten gevonden voor “{query}”.</div>}
            </div>
          </section>

          <section className="panel methods-panel">
            <div className="panel-heading">
              <div><h2>Conversiemethoden</h2><p>Huidige voorkeursvolgorde</p></div>
              <button className="more-button" onClick={() => { setMenuOpen(!menuOpen); setActiveView("operations"); }} aria-expanded={menuOpen}>•••</button>
            </div>
            <div className="method-list">
              {methods.map((method) => (
                <button className="method" key={method.id} onClick={() => setActiveView("operations")}>
                  <span className={`method-number ${method.tone}`}>{method.id}</span>
                  <span><strong>{method.name}</strong><small>{method.detail}</small></span>
                  <span className={`method-status ${method.tone}`}>{method.status}</span>
                </button>
              ))}
            </div>
            <div className="policy-note">
              <span><Icon name="alert" size={18} /></span>
              <p><strong>Actieve beleidsregel</strong>De grens van €300 is instelbaar. Drukte en beschikbaarheid kunnen een gemotiveerde afwijking toestaan.</p>
            </div>
          </section>
        </div>
          </>
        )}

        {role === "management" && activeView === "inventory" && (
          <>
            {/* Boven de kast: hetzelfde bestelbeeld dat Noviply ziet, in het
                Nederlands. Zij en wij hoorden niet elk hun eigen som te maken —
                dan gaat het gesprek over wiens cijfer klopt in plaats van over
                wat er besteld moet worden. */}
            <StockPlanner
              taal="nl"
              transactions={transactions}
              quantities={catalogQuantities}
              policy={{
                leadTimeDays: operationsPolicy.resupplyLeadTimeDays,
                reviewDays: 7,
                safetyDays: operationsPolicy.resupplySafetyWeeks * 7,
              }}
              abcA={operationsPolicy.abcAThreshold}
              abcB={operationsPolicy.abcBThreshold}
            />
          <InventoryCatalog
            skuOverrides={skuOverrides}
            onSkuChange={changeCatalogSku}
            globalQuery={query}
            quantities={catalogQuantities}
            onReceive={(item) => {
              const currentStock = inventoryQuantity(catalogQuantities, item);
              setMutation({
                mode: "receipt",
                catalogItem: item,
                item: {
                  catalogKey: item.catalogKey,
                  storageNumber: item.storageNumber,
                  model: item.model,
                  sku: item.sku,
                  layout: item.layout,
                  stock: currentStock,
                  threshold: calculateCatalogThreshold(item.averageWeeklyDemand, item.leadTimeDays, item.safetyStockWeeks),
                },
              });
            }}
          />
          </>
        )}
        {role === "management" && activeView === "conversions" && <ConversionsWorkspace onNew={() => setAdvisorOpen(true)} conversionLog={conversionLog} />}
        {role === "management" && activeView === "orders" && <OrdersWorkspace />}
        {role === "management" && activeView === "models" && <ModelsWorkspace />}
        {role === "management" && (activeView === "operations" || activeView === "movers" || activeView === "layoutgroups") && (
          <OperationsManagement
            key={activeView}
            tabs={
              activeView === "movers" ? ["abc"]
              : activeView === "layoutgroups" ? ["model_groups"]
              : undefined
            }
            quantities={catalogQuantities}
            transactions={transactions}
            policy={operationsPolicy}
            verificationReports={verificationReports}
            stockCounts={stockCounts}
            modelGroupDecisions={modelGroupDecisions}
            compatibilityEvidenceRecords={compatibilityEvidenceRecords}
            recoveryDrills={recoveryDrills}
            goLiveAcceptanceRecords={goLiveAcceptanceRecords}
            workfloorTrials={workfloorTrials}
            actorName={actorName}
            continuitySync={continuitySync}
            acceptanceSync={acceptanceSync}
            workfloorSync={workfloorSync}
            onRefreshContinuity={() => setContinuityRefreshToken((current) => current + 1)}
            onRefreshAcceptance={() => setAcceptanceRefreshToken((current) => current + 1)}
            onRefreshWorkfloor={() => setWorkfloorRefreshToken((current) => current + 1)}
            onRecordStockCount={recordStockCount}
            onReviewModelGroup={reviewModelGroup}
            onRecordCompatibilityEvidence={recordCompatibilityEvidence}
            onRecordRecoveryDrill={recordRecoveryDrill}
            onRecordGoLiveAcceptance={recordGoLiveAcceptance}
            onRecordWorkfloorTrial={recordWorkfloorTrial}
            onPolicyChange={savePolicy}
            persistence={{
              ready: persistenceReady,
              lastSavedAt,
              message: persistenceMessage,
            }}
            onExportBackup={exportPilotBackup}
          />
        )}
        {role === "management" && activeView === "settings" && (
          <SettingsWorkspace
            policy={operationsPolicy}
            directPrintLayouts={directPrintLayouts}
            noviplyUnavailable={noviplyUnavailable}
            onAllowNoviplyAgain={allowNoviplyAgain}
            onSave={savePolicy}
          />
        )}
        {role === "management" && activeView === "reports" && (
          <ReportsWorkspace
            conversionLog={conversionLog}
            transactions={transactions}
            quantities={catalogQuantities}
          />
        )}

        <footer className="app-footer">
          <span className={`sync-state ${sharedStatus}`}><i /> {syncLabel}</span>
          <span>{lastAction}</span>
        </footer>
        {role === "noviply" && openReminder(printReminders) && (
          <PrintReminderPrompt
            reminder={openReminder(printReminders)!}
            onSeen={() => seenReminder(openReminder(printReminders)!.id)}
          />
        )}
        {role === "employee" && openCheck(printerChecks) && (
          <PrinterCheckPrompt
            check={openCheck(printerChecks)!}
            onAnswer={(status, note) => replyPrinterCheck(openCheck(printerChecks)!.id, status, note)}
          />
        )}
        {unlockOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Aanmelden">
            <div className="modal unlock-modal">
              <div className="modal-head">
                <h2>{mustChangePin ? "Kies je eigen pincode" : "Aanmelden"}</h2>
                {!mustChangePin && (
                  <button onClick={() => { setUnlockOpen(false); setUnlockError(""); }} aria-label="Sluiten">×</button>
                )}
              </div>

              {mustChangePin ? (
                <>
                  <div className="modal-body">
                    <p className="unlock-intro">
                      Je bent binnen met een tijdelijke code die iemand anders heeft gezet.
                      Kies er nu een die alleen jij kent — daarna gebruik je die.
                    </p>
                    <label className="unlock-field">
                      <span>Nieuwe pincode</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={4}
                        value={newPin}
                        autoFocus
                        onChange={(event) => { setNewPin(event.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setUnlockError(""); }}
                        placeholder="••••"
                      />
                    </label>
                    <label className="unlock-field">
                      <span>Nog een keer</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={4}
                        value={newPinAgain}
                        onChange={(event) => { setNewPinAgain(event.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setUnlockError(""); }}
                        onKeyDown={(event) => { if (event.key === "Enter") void submitNewPin(); }}
                        placeholder="••••"
                      />
                    </label>
                    {unlockError && <p className="form-error">{unlockError}</p>}
                  </div>
                  <div className="modal-actions">
                    <button
                      className="primary-button"
                      disabled={unlocking || newPin.length !== 4 || newPinAgain.length !== 4}
                      onClick={() => void submitNewPin()}
                    >
                      {unlocking ? "Opslaan…" : "Pincode instellen"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-body">
                    <p className="unlock-intro">
                      De werkvloer heeft geen pincode nodig. Voor management en Noviply wel,
                      omdat daar beleid, inkoop en een externe partij achter zitten.
                    </p>
                    <div className="unlock-people" role="group" aria-label="Wie ben je?">
                      {accounts.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          className={chosenAccount === account.id ? "active" : ""}
                          onClick={() => { setChosenAccount(account.id); setUnlockError(""); }}
                        >
                          <strong>{account.name}</strong>
                          <small>{roleLabel(account.role)}</small>
                        </button>
                      ))}
                      {accounts.length === 0 && (
                        <p className="unlock-empty">Er is nog niemand met een pincode.</p>
                      )}
                    </div>
                    <label className="unlock-field">
                      <span>Pincode</span>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        value={unlockCode}
                        autoFocus
                        onChange={(event) => { setUnlockCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 4)); setUnlockError(""); }}
                        onKeyDown={(event) => { if (event.key === "Enter") void submitUnlock(); }}
                        placeholder="••••"
                      />
                    </label>
                    {unlockError && <p className="form-error">{unlockError}</p>}
                  </div>
                  <div className="modal-actions">
                    <button className="secondary-button" onClick={() => { setUnlockOpen(false); setUnlockError(""); }}>
                      Annuleren
                    </button>
                    <button
                      className="primary-button"
                      disabled={unlocking || unlockCode.length !== 4 || !chosenAccount}
                      onClick={() => void submitUnlock()}
                    >
                      {unlocking ? "Controleren…" : "Aanmelden"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <AddStickerSheetDialog
          open={addSheetOpen}
          onClose={() => setAddSheetOpen(false)}
          onAdded={() => {
            void refreshSharedState();
            setLastAction("Nieuw stickervel toegevoegd aan de voorraad.");
          }}
        />
        <ConversionAdvisor open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
        {niveausOpen && (
          <MethodPhotoHelp huidig={null} onClose={() => setNiveausOpen(false)} />
        )}
        <AccessManagementDialog
          open={accessOpen}
          onClose={() => setAccessOpen(false)}
          currentUserId={signedInUserId}
        />
        <InventoryImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onReview={setReviewBatchId}
        />
        {reviewBatchId && (
          <ImportReviewDialog batchId={reviewBatchId} onClose={() => setReviewBatchId(null)} />
        )}
        {mutation && (
          <InventoryMutationDialog
            open
            mode={mutation.mode}
            item={mutation.item}
            onClose={() => setMutation(null)}
            onConfirm={saveMutation}
          />
        )}
      </main>
    </div>
  );
}

function roleLabel(role: UserRole) {
  if (role === "management") return "Management";
  if (role === "noviply") return "Noviply";
  return "Werknemer";
}

function initialsFor(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "KF";
  return `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function formatPersistenceTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function quantityForInventoryItem(
  quantities: Record<string, number>,
  item: InventoryItem,
) {
  const catalogItem = findCatalogItemForInventoryItem(item);
  return catalogItem
    ? inventoryQuantity(quantities, catalogItem)
    : item.stock;
}

function findCatalogItemForInventoryItem(item: InventoryItem) {
  if (item.catalogKey) {
    return inventoryCatalog.find(
      ({ catalogKey }) => catalogKey === item.catalogKey,
    );
  }
  const candidates = inventoryCatalog.filter(
    (candidate) =>
      candidate.dataQuality === "ready"
      && candidate.sku === item.sku,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function inventoryItemsMatch(left: InventoryItem, right: InventoryItem) {
  if (left.catalogKey || right.catalogKey) {
    return left.catalogKey === right.catalogKey;
  }
  return left.sku === right.sku;
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

async function responseErrorMessage(response: Response) {
  try {
    const body = await response.json() as {
      message?: unknown;
      error?: unknown;
    };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  } catch {
    // De HTTP-status blijft de veilige fallback wanneer de body niet leesbaar is.
  }
  return `Centrale aanvraag mislukt (${response.status}).`;
}
