import { z } from "zod";

export const workfloorMethodIds = [
  "loose_stickers",
  "noviply_sheet",
  "printed_sticker",
  "direct_reprint",
] as const;

export type WorkfloorMethodId = (typeof workfloorMethodIds)[number];
export type WorkfloorTrialResult = "open" | "passed" | "failed";

export const workfloorMethodLabels: Record<WorkfloorMethodId, string> = {
  loose_stickers: "Losse stickers · uitfaseringsfallback",
  noviply_sheet: "Oud Noviply-voorraadvel",
  printed_sticker: "Sterke printsticker",
  direct_reprint: "Directe keyboardprint",
};

export const workfloorTrialInputSchema = z.object({
  trialReference: z.string().trim().min(3).max(160),
  location: z.string().trim().min(2).max(160),
  deviceType: z.enum(["desktop", "tablet"]),
  deviceName: z.string().trim().min(2).max(160),
  scannerName: z.string().trim().min(2).max(160),
  participants: z.number().int().min(1).max(50),
  ordersTested: z.number().int().min(0).max(500),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  averageHandlingSeconds: z.number().int().positive().max(7_200).nullable()
    .default(null),
  methods: z.object({
    loose_stickers: z.boolean(),
    noviply_sheet: z.boolean(),
    printed_sticker: z.boolean(),
    direct_reprint: z.boolean(),
  }),
  errorScenarioTested: z.boolean(),
  checks: z.object({
    orderScanWithoutMouse: z.boolean(),
    modelResolution: z.boolean(),
    hangingFileMatched: z.boolean(),
    keyboardGuideReadable: z.boolean(),
    deductionAfterVerification: z.boolean(),
    mismatchStopsDeduction: z.boolean(),
  }),
  result: z.enum(["open", "passed", "failed"]),
  evidenceReference: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1200).default(""),
});

export type WorkfloorTrialInput = z.input<typeof workfloorTrialInputSchema>;

export type WorkfloorTrialRecord = z.output<
  typeof workfloorTrialInputSchema
> & {
  id: string;
  recordedAt: string;
  recordedBy: string;
};

export class WorkfloorTrialError extends Error {
  constructor(
    public readonly code:
      | "INVALID_TIMELINE"
      | "PASSED_TRIAL_INCOMPLETE"
      | "PASSED_EVIDENCE_REQUIRED"
      | "FAILED_NOTES_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "WorkfloorTrialError";
  }
}

export function createWorkfloorTrialRecord(
  rawInput: WorkfloorTrialInput,
  metadata: Pick<WorkfloorTrialRecord, "id" | "recordedAt" | "recordedBy">,
): WorkfloorTrialRecord {
  const input = workfloorTrialInputSchema.parse(rawInput);
  if (
    input.completedAt
    && input.completedAt.localeCompare(input.startedAt) <= 0
  ) {
    throw new WorkfloorTrialError(
      "INVALID_TIMELINE",
      "Het eindmoment moet na de start van de werkvloerproef liggen.",
    );
  }
  if (input.result === "passed") {
    const executionComplete = Boolean(
      input.completedAt
      && input.averageHandlingSeconds
      && input.ordersTested >= 5
      && input.errorScenarioTested
      && Object.values(input.methods).every(Boolean)
      && Object.values(input.checks).every(Boolean),
    );
    if (!executionComplete) {
      throw new WorkfloorTrialError(
        "PASSED_TRIAL_INCOMPLETE",
        "Een geslaagde proef vereist minimaal vijf orders, alle vier methoden, een foutscenario, doorlooptijd en alle controles.",
      );
    }
    if (input.evidenceReference.length < 5) {
      throw new WorkfloorTrialError(
        "PASSED_EVIDENCE_REQUIRED",
        "Een geslaagde proef vereist een herleidbare bewijsreferentie.",
      );
    }
  }
  if (
    input.result === "failed"
    && (!input.completedAt || input.notes.length < 10)
  ) {
    throw new WorkfloorTrialError(
      "FAILED_NOTES_REQUIRED",
      "Leg bij een mislukte proef het eindmoment, de oorzaak en vervolgactie vast.",
    );
  }
  return { ...input, ...metadata };
}

export function workfloorTrialSummary(
  records: readonly WorkfloorTrialRecord[],
) {
  const sorted = [...records].sort(
    (left, right) => right.recordedAt.localeCompare(left.recordedAt),
  );
  return {
    total: sorted.length,
    passed: sorted.filter(({ result }) => result === "passed").length,
    failed: sorted.filter(({ result }) => result === "failed").length,
    open: sorted.filter(({ result }) => result === "open").length,
    latest: sorted[0] ?? null,
    latestPassed: sorted.find(({ result }) => result === "passed") ?? null,
  };
}
