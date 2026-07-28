import type { InventoryCatalogItem } from "@/data/inventory-catalog";

export type CompatibilityEvidenceStatus = "approved" | "rejected";

export type CompatibilityCheckpoints = {
  enterShape: boolean;
  shiftKeys: boolean;
  arrowKeys: boolean;
  functionRow: boolean;
  pointingStickAndNumpad: boolean;
};

export type CompatibilityEvidenceInput = {
  catalogKey: string;
  model: string;
  status: CompatibilityEvidenceStatus;
  manufacturerPartNumber: string;
  photoReference: string;
  keyboardWidthMm: number;
  keyboardHeightMm: number;
  checkpoints: CompatibilityCheckpoints;
  notes: string;
};

export type CompatibilityEvidenceRecord = CompatibilityEvidenceInput & {
  id: string;
  recordedAt: string;
  reviewer: string;
  sku: string;
  storageNumber: number;
  layout: string;
  variant: string;
};

type EvidenceMetadata = {
  id: string;
  recordedAt: string;
  reviewer: string;
};

export const emptyCompatibilityCheckpoints: CompatibilityCheckpoints = {
  enterShape: false,
  shiftKeys: false,
  arrowKeys: false,
  functionRow: false,
  pointingStickAndNumpad: false,
};

export function createCompatibilityEvidenceRecord(
  catalog: InventoryCatalogItem[],
  input: CompatibilityEvidenceInput,
  metadata: EvidenceMetadata,
): CompatibilityEvidenceRecord {
  const item = catalog.find(({ catalogKey }) => catalogKey === input.catalogKey);
  if (!item || item.dataQuality !== "ready") {
    throw new CompatibilityEvidenceError(
      "De gekozen hangmap is onbekend of operationeel geblokkeerd.",
    );
  }

  const model = input.model.trim();
  if (!item.modelAliases.some((alias) => normalize(alias) === normalize(model))) {
    throw new CompatibilityEvidenceError(
      "Het gekozen model staat niet als bronkoppeling bij deze hangmap.",
    );
  }

  const manufacturerPartNumber = input.manufacturerPartNumber.trim();
  const photoReference = input.photoReference.trim();
  const notes = input.notes.trim();
  const reviewer = metadata.reviewer.trim();
  if (manufacturerPartNumber.length < 3) {
    throw new CompatibilityEvidenceError(
      "Vul het exacte fabrikantonderdeelnummer in.",
    );
  }
  if (photoReference.length < 3) {
    throw new CompatibilityEvidenceError(
      "Vul een herleidbare bovenaanzichtfoto of documentreferentie in.",
    );
  }
  if (!Number.isFinite(input.keyboardWidthMm)
    || input.keyboardWidthMm < 150
    || input.keyboardWidthMm > 500) {
    throw new CompatibilityEvidenceError(
      "Keyboardbreedte moet tussen 150 en 500 millimeter liggen.",
    );
  }
  if (!Number.isFinite(input.keyboardHeightMm)
    || input.keyboardHeightMm < 50
    || input.keyboardHeightMm > 250) {
    throw new CompatibilityEvidenceError(
      "Keyboardhoogte moet tussen 50 en 250 millimeter liggen.",
    );
  }
  if (!reviewer) {
    throw new CompatibilityEvidenceError(
      "Een persoonlijke managementbeoordelaar is verplicht.",
    );
  }

  if (input.status === "approved") {
    const allChecked = Object.values(input.checkpoints).every(Boolean);
    if (!allChecked) {
      throw new CompatibilityEvidenceError(
        "Goedkeuren kan pas nadat alle vijf fysieke controlepunten zijn bevestigd.",
      );
    }
  } else if (notes.length < 5) {
    throw new CompatibilityEvidenceError(
      "Leg bij een afgewezen pastest vast wat fysiek niet overeenkomt.",
    );
  }

  return {
    ...input,
    model,
    manufacturerPartNumber,
    photoReference,
    notes,
    id: metadata.id,
    recordedAt: metadata.recordedAt,
    reviewer,
    sku: item.sku,
    storageNumber: item.storageNumber,
    layout: item.layout,
    variant: item.sku.match(/E\d+/i)?.[0]?.toUpperCase() ?? "Onbekend",
  };
}

export function latestCompatibilityEvidence(
  records: CompatibilityEvidenceRecord[],
  catalogKey: string,
  model: string,
) {
  return [...records]
    .filter(
      (record) =>
        record.catalogKey === catalogKey
        && normalize(record.model) === normalize(model),
    )
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0]
    ?? null;
}

export class CompatibilityEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompatibilityEvidenceError";
  }
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}
