import { z } from "zod";

export const goLiveAcceptanceGates = [
  "database_recovery",
  "identity_access",
  "order_integration",
  "compatibility_evidence",
  "workfloor_acceptance",
] as const;

export type GoLiveAcceptanceGate = (typeof goLiveAcceptanceGates)[number];
export type GoLiveAcceptanceDecision = "pending" | "approved" | "rejected";

export const goLiveAcceptanceGateLabels: Record<GoLiveAcceptanceGate, {
  label: string;
  evidenceHint: string;
}> = {
  database_recovery: {
    label: "Database & herstel",
    evidenceHint: "Providerrestore, RPO/RTO, databasecheck en verantwoordelijke.",
  },
  identity_access: {
    label: "Entra & toegangsbeleid",
    evidenceHint: "Tenant, app-rollen, MFA/Conditional Access en toegangstest.",
  },
  order_integration: {
    label: "Orderkoppeling",
    evidenceHint: "Testorders, veldmapping, foutscenario's en systeemeigenaar.",
  },
  compatibility_evidence: {
    label: "Compatibiliteitsbewijs",
    evidenceHint: "Onderdeelnummers, foto's, E1/E2 en fysieke droge pastesten.",
  },
  workfloor_acceptance: {
    label: "Werkvloeracceptatie",
    evidenceHint: "Scanner, werkstation, hangmappenwagen, medewerkers en timing.",
  },
};

export const goLiveAcceptanceGateRequirements: Record<
  GoLiveAcceptanceGate,
  readonly string[]
> = {
  database_recovery: [
    "Providerback-up buiten productie hersteld",
    "Gemeten RPO en RTO met providerlog vastgelegd",
    "Migraties, bronmomentopname en voorraadsluiting gecontroleerd",
    "Herstelverantwoordelijke heeft het resultaat afgetekend",
  ],
  identity_access: [
    "Productietenant en redirect-URL gecontroleerd",
    "Werknemer- en managementrol met echte accounts getest",
    "MFA en Conditional Access aantoonbaar actief",
    "Uitloggen, sessieverloop en accountblokkade getest",
  ],
  order_integration: [
    "Bekende, onbekende en geblokkeerde testorder uitgevoerd",
    "Model, bedrag en beide layouts tegen de orderbron gecontroleerd",
    "Dubbele scan en tijdelijke API-uitval getest",
    "Systeemeigenaar heeft veldmapping en foutafhandeling goedgekeurd",
  ],
  compatibility_evidence: [
    "Exact model, onderdeelnummer, SKU en E1/E2 vastgelegd",
    "Goedgekeurde bovenaanzichtfoto herleidbaar opgeslagen",
    "Afmetingen en vijf vormcontrolepunten bevestigd",
    "Fysieke droge pastest door management afgetekend",
  ],
  workfloor_acceptance: [
    "Scannerflow zonder muis op het echte werkstation getest",
    "Hangmapnummer tegen de fysieke wagen gecontroleerd",
    "Iedere conversiemethode plus minimaal één foutscenario uitgevoerd",
    "Medewerkers, doorlooptijd en bevindingen vastgelegd",
  ],
};

export const goLiveAcceptanceInputSchema = z.object({
  gate: z.enum(goLiveAcceptanceGates),
  ownerName: z.string().trim().min(2).max(160),
  evidenceReference: z.string().trim().max(300).default(""),
  evidenceDate: z.string().datetime().nullable().default(null),
  checks: z.object({
    scopeConfirmed: z.boolean(),
    testCompleted: z.boolean(),
    evidenceAttached: z.boolean(),
    ownerApproved: z.boolean(),
  }),
  decision: z.enum(["pending", "approved", "rejected"]),
  notes: z.string().trim().max(1200).default(""),
});

export type GoLiveAcceptanceInput = z.input<
  typeof goLiveAcceptanceInputSchema
>;

export type GoLiveAcceptanceRecord = z.output<
  typeof goLiveAcceptanceInputSchema
> & {
  id: string;
  recordedAt: string;
  reviewedBy: string;
};

export class GoLiveAcceptanceError extends Error {
  constructor(
    public readonly code:
      | "APPROVAL_CHECKS_INCOMPLETE"
      | "APPROVAL_EVIDENCE_REQUIRED"
      | "REJECTION_NOTES_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "GoLiveAcceptanceError";
  }
}

export function createGoLiveAcceptanceRecord(
  rawInput: GoLiveAcceptanceInput,
  metadata: Pick<GoLiveAcceptanceRecord, "id" | "recordedAt" | "reviewedBy">,
): GoLiveAcceptanceRecord {
  const input = goLiveAcceptanceInputSchema.parse(rawInput);
  if (input.decision === "approved") {
    if (!Object.values(input.checks).every(Boolean)) {
      throw new GoLiveAcceptanceError(
        "APPROVAL_CHECKS_INCOMPLETE",
        "Een goedkeuring vereist alle vier vrijgavecontroles.",
      );
    }
    if (input.evidenceReference.length < 5 || !input.evidenceDate) {
      throw new GoLiveAcceptanceError(
        "APPROVAL_EVIDENCE_REQUIRED",
        "Een goedkeuring vereist een herleidbare bewijsreferentie en bewijsdatum.",
      );
    }
  }
  if (input.decision === "rejected" && input.notes.length < 10) {
    throw new GoLiveAcceptanceError(
      "REJECTION_NOTES_REQUIRED",
      "Leg bij een afwijzing de oorzaak en vervolgactie vast.",
    );
  }
  return { ...input, ...metadata };
}

export function latestGoLiveAcceptanceByGate(
  records: readonly GoLiveAcceptanceRecord[],
) {
  const latest = new Map<GoLiveAcceptanceGate, GoLiveAcceptanceRecord>();
  for (const record of [...records].sort(
    (left, right) => right.recordedAt.localeCompare(left.recordedAt),
  )) {
    if (!latest.has(record.gate)) latest.set(record.gate, record);
  }
  return latest;
}

export function goLiveAcceptanceSummary(
  records: readonly GoLiveAcceptanceRecord[],
) {
  const latest = latestGoLiveAcceptanceByGate(records);
  const decisions = goLiveAcceptanceGates.map(
    (gate) => latest.get(gate)?.decision ?? "pending",
  );
  return {
    total: goLiveAcceptanceGates.length,
    approved: decisions.filter((decision) => decision === "approved").length,
    rejected: decisions.filter((decision) => decision === "rejected").length,
    pending: decisions.filter((decision) => decision === "pending").length,
    canRelease: decisions.every((decision) => decision === "approved"),
  };
}

export type GoLiveAcceptanceSummary = ReturnType<
  typeof goLiveAcceptanceSummary
>;

export type GoLiveAcceptanceDossier = {
  format: "keyflow-go-live-acceptance";
  version: 1;
  generatedAt: string;
  generatedBy: string;
  storageMode: "local" | "central";
  summary: GoLiveAcceptanceSummary;
  gates: Array<{
    gate: GoLiveAcceptanceGate;
    label: string;
    evidenceHint: string;
    requirements: readonly string[];
    currentDecision: GoLiveAcceptanceRecord | null;
  }>;
  history: GoLiveAcceptanceRecord[];
};

export function createGoLiveAcceptanceDossier(
  records: readonly GoLiveAcceptanceRecord[],
  metadata: Pick<
    GoLiveAcceptanceDossier,
    "generatedAt" | "generatedBy" | "storageMode"
  >,
): GoLiveAcceptanceDossier {
  const generatedAt = z.string().datetime().parse(metadata.generatedAt);
  const generatedBy = z.string().trim().min(2).max(160)
    .parse(metadata.generatedBy);
  const latest = latestGoLiveAcceptanceByGate(records);
  return {
    format: "keyflow-go-live-acceptance",
    version: 1,
    generatedAt,
    generatedBy,
    storageMode: metadata.storageMode,
    summary: goLiveAcceptanceSummary(records),
    gates: goLiveAcceptanceGates.map((gate) => ({
      gate,
      label: goLiveAcceptanceGateLabels[gate].label,
      evidenceHint: goLiveAcceptanceGateLabels[gate].evidenceHint,
      requirements: goLiveAcceptanceGateRequirements[gate],
      currentDecision: latest.get(gate) ?? null,
    })),
    history: [...records].sort(
      (left, right) => right.recordedAt.localeCompare(left.recordedAt),
    ),
  };
}
