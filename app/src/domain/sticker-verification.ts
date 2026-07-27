export const stickerVerificationCheckIds = [
  "storage",
  "sku",
  "layout",
  "variant",
  "positioning",
] as const;

export type StickerVerificationCheckId = typeof stickerVerificationCheckIds[number];

export type StickerVerificationChecks = Record<StickerVerificationCheckId, boolean>;

export type StickerVerificationFailureReason =
  | "wrong_storage"
  | "wrong_sku"
  | "wrong_layout"
  | "wrong_variant"
  | "position_mismatch"
  | "other";

export type StickerVerificationReport = {
  id: string;
  occurredAt: string;
  orderReference: string;
  sku: string;
  storageNumber: number;
  model: string;
  targetLayout: string;
  variant: string;
  outcome: "passed" | "blocked_unused" | "scrapped";
  failureReason?: StickerVerificationFailureReason;
  actor: string;
};

export type StickerVerificationReportInput = Omit<
  StickerVerificationReport,
  "id" | "occurredAt" | "actor"
>;

export function createEmptyStickerVerificationChecks(): StickerVerificationChecks {
  return {
    storage: false,
    sku: false,
    layout: false,
    variant: false,
    positioning: false,
  };
}

export function areStickerVerificationChecksComplete(checks: StickerVerificationChecks) {
  return stickerVerificationCheckIds.every((checkId) => checks[checkId]);
}

export function stickerVerificationFailureLabel(reason?: StickerVerificationFailureReason) {
  return {
    wrong_storage: "Verkeerde hangmap gepakt",
    wrong_sku: "Artikelnummer wijkt af",
    wrong_layout: "Layout wijkt af",
    wrong_variant: "E1/E2-variant wijkt af",
    position_mismatch: "Toetsvorm of positionering past niet",
    other: "Andere afwijking",
  }[reason ?? "other"];
}
