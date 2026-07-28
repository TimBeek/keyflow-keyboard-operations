import { z } from "zod";

export const recoveryCheckKeys = [
  "migrations",
  "sourceSnapshot",
  "inventoryBalances",
  "transactionLedger",
  "accessControl",
] as const;

export type RecoveryCheckKey = (typeof recoveryCheckKeys)[number];
export type RecoveryDrillResult = "passed" | "failed";
export type RecoveryTargetEnvironment = "staging" | "recovery";

export const recoveryDrillInputSchema = z.object({
  backupReference: z.string().trim().min(3).max(200),
  targetEnvironment: z.enum(["staging", "recovery"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  rpoMinutes: z.number().int().nonnegative().max(43_200),
  rtoMinutes: z.number().int().nonnegative().max(10_080),
  checks: z.object({
    migrations: z.boolean(),
    sourceSnapshot: z.boolean(),
    inventoryBalances: z.boolean(),
    transactionLedger: z.boolean(),
    accessControl: z.boolean(),
  }),
  result: z.enum(["passed", "failed"]),
  notes: z.string().trim().max(1000).default(""),
});

export type RecoveryDrillInput = z.input<typeof recoveryDrillInputSchema>;

export type RecoveryDrillRecord = z.output<typeof recoveryDrillInputSchema> & {
  id: string;
  recordedAt: string;
  recordedBy: string;
};

export type ProductionReadinessGate = {
  id:
    | "release"
    | "database_bootstrap"
    | "managed_database"
    | "recovery_drill"
    | "personal_identity"
    | "order_source"
    | "workfloor_acceptance";
  label: string;
  status: "ready" | "action_required" | "external";
  detail: string;
};

export type CentralReadinessCheck = {
  id: "migration" | "source_snapshot" | "inventory_integrity" | "recovery_drill";
  label: string;
  ready: boolean;
  detail: string;
};

export type CentralOperationsReadinessReport = {
  ready: boolean;
  databaseReady: boolean;
  generatedAt: string;
  maxRecoveryAgeDays: number;
  latestMigration: string | null;
  snapshot: {
    status: string | null;
    rowCount: number | null;
    totalQuantity: number | null;
  };
  inventory: {
    operationalRows: number;
    linkedBalances: number;
    onHand: number;
    ledgerQuantity: number;
  };
  latestRecoveryDrill: RecoveryDrillRecord | null;
  checks: CentralReadinessCheck[];
};

export type ProductionReadinessContext = {
  centralDatabaseReady?: boolean;
  personalIdentityReady?: boolean;
};

export class RecoveryDrillError extends Error {
  constructor(
    public readonly code:
      | "INVALID_TIME_RANGE"
      | "PASSED_CHECKS_INCOMPLETE"
      | "FAILED_NOTES_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "RecoveryDrillError";
  }
}

export function createRecoveryDrill(
  rawInput: RecoveryDrillInput,
  metadata: Pick<RecoveryDrillRecord, "id" | "recordedAt" | "recordedBy">,
): RecoveryDrillRecord {
  const input = recoveryDrillInputSchema.parse(rawInput);
  const startedAt = new Date(input.startedAt);
  const completedAt = new Date(input.completedAt);
  if (completedAt.getTime() < startedAt.getTime()) {
    throw new RecoveryDrillError(
      "INVALID_TIME_RANGE",
      "De hersteltijd kan niet vóór de starttijd liggen.",
    );
  }

  const allChecksPassed = recoveryCheckKeys.every((key) => input.checks[key]);
  if (input.result === "passed" && !allChecksPassed) {
    throw new RecoveryDrillError(
      "PASSED_CHECKS_INCOMPLETE",
      "Een geslaagde herstelproef vereist alle vijf integriteitscontroles.",
    );
  }
  if (input.result === "failed" && input.notes.trim().length < 10) {
    throw new RecoveryDrillError(
      "FAILED_NOTES_REQUIRED",
      "Leg bij een mislukte herstelproef de oorzaak en vervolgactie vast.",
    );
  }

  return {
    ...input,
    ...metadata,
  };
}

export function latestRecoveryDrill(records: readonly RecoveryDrillRecord[]) {
  return [...records].sort((left, right) =>
    right.completedAt.localeCompare(left.completedAt))[0] ?? null;
}

export function productionReadinessGates(
  records: readonly RecoveryDrillRecord[],
  context: ProductionReadinessContext = {},
): ProductionReadinessGate[] {
  const latestDrill = latestRecoveryDrill(records);
  const recoveryReady = latestDrill?.result === "passed";

  return [
    {
      id: "release",
      label: "Geteste applicatierelease",
      status: "ready",
      detail: "CI, beveiligingsaudit, private hosting en versieherkomst zijn ingericht.",
    },
    {
      id: "database_bootstrap",
      label: "Gecontroleerde beginimport",
      status: "ready",
      detail: "Preflight, transactionele bootstrap en verificatie zijn reproduceerbaar.",
    },
    {
      id: "managed_database",
      label: "Beheerde PostgreSQL-productie",
      status: context.centralDatabaseReady ? "ready" : "external",
      detail: context.centralDatabaseReady
        ? "De centrale database is bereikbaar en de bron- en voorraadcontroles sluiten."
        : "Productiedatabase, netwerktoegang en providerback-ups moeten nog worden geleverd.",
    },
    {
      id: "recovery_drill",
      label: "Herstelproef buiten productie",
      status: recoveryReady ? "ready" : "action_required",
      detail: recoveryReady && latestDrill
        ? `Laatste geslaagde proef: ${latestDrill.backupReference}.`
        : latestDrill
          ? "De laatste herstelproef is mislukt; herstelactie en hertest zijn verplicht."
          : "Nog geen geslaagde herstelproef geregistreerd.",
    },
    {
      id: "personal_identity",
      label: "Persoonlijke Entra-login",
      status: context.personalIdentityReady ? "ready" : "external",
      detail: context.personalIdentityReady
        ? "Management gebruikt een persoonlijke Entra-sessie voor centrale acties."
        : "Tenantregistratie, roltoewijzing, MFA en Conditional Access ontbreken nog.",
    },
    {
      id: "order_source",
      label: "Werkelijke orderbron",
      status: "external",
      detail: "De adapter is gereed; API-toegang, veldmapping en testorders ontbreken.",
    },
    {
      id: "workfloor_acceptance",
      label: "Werkvloeracceptatie",
      status: "external",
      detail: "Scanner, werkstation, hangmappenwagen en medewerkers moeten nog formeel testen.",
    },
  ];
}

export function productionReadinessSummary(
  records: readonly RecoveryDrillRecord[],
  context: ProductionReadinessContext = {},
) {
  const gates = productionReadinessGates(records, context);
  return {
    total: gates.length,
    ready: gates.filter(({ status }) => status === "ready").length,
    actionRequired: gates.filter(({ status }) => status === "action_required").length,
    external: gates.filter(({ status }) => status === "external").length,
  };
}
