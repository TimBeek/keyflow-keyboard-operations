import type { InventoryCatalogItem } from "@/data/inventory-catalog";

export type ModelGroupProposal = {
  id: string;
  proposedName: string;
  manufacturer: string;
  models: string[];
  sku: string;
  layout: string;
  variant: string;
  storageNumber: number;
  sourceRow: number;
  confidence: number;
  conflictingModels: string[];
  evidence: string[];
  missingEvidence: string[];
};

export type ModelGroupDecisionStatus = "approved" | "rejected";

export type ModelGroupEvidence = {
  exactVariantConfirmed: boolean;
  manufacturerPartNumberConfirmed: boolean;
  photoConfirmed: boolean;
  dryFitPassed: boolean;
};

export type ModelGroupReviewInput = {
  status: ModelGroupDecisionStatus;
  manufacturerPartNumber: string;
  photoReference: string;
  notes: string;
  evidence: ModelGroupEvidence;
};

export type ModelGroupDecision = ModelGroupReviewInput & {
  id: string;
  proposalId: string;
  decidedAt: string;
  reviewer: string;
};

type DecisionMetadata = {
  id: string;
  decidedAt: string;
  reviewer: string;
};

const requiredApprovalEvidence: (keyof ModelGroupEvidence)[] = [
  "exactVariantConfirmed",
  "manufacturerPartNumberConfirmed",
  "photoConfirmed",
  "dryFitPassed",
];

export function createModelGroupProposals(
  catalog: InventoryCatalogItem[],
): ModelGroupProposal[] {
  const usageByModel = new Map<string, Set<string>>();

  for (const item of catalog) {
    if (item.dataQuality !== "ready") continue;
    for (const model of uniqueModels(item.modelAliases)) {
      const normalized = normalizeModel(model);
      const usages = usageByModel.get(normalized) ?? new Set<string>();
      usages.add(`${item.sku}|${item.layout}`);
      usageByModel.set(normalized, usages);
    }
  }

  return catalog
    .filter(
      (item) =>
        item.dataQuality === "ready"
        && uniqueModels(item.modelAliases).length >= 2,
    )
    .map((item) => {
      const models = uniqueModels(item.modelAliases);
      const manufacturers = uniqueModels(models.map(inferManufacturer));
      const manufacturer = manufacturers.length === 1
        ? manufacturers[0]
        : "Meerdere fabrikanten";
      const variant = item.sku.match(/E\d+/i)?.[0]?.toUpperCase()
        ?? "Onbekend";
      const conflictingModels = models.filter(
        (model) => (usageByModel.get(normalizeModel(model))?.size ?? 0) > 1,
      );
      const baseConfidence = 52
        + Math.min(models.length, 6) * 3
        + (manufacturers.length === 1 ? 8 : 0)
        + (variant !== "Onbekend" ? 5 : 0);
      const confidence = Math.max(
        35,
        Math.min(79, baseConfidence - Math.min(conflictingModels.length * 4, 20)),
      );

      return {
        id: `modelgroep-${item.catalogKey}`,
        proposedName: proposalName(manufacturer, models, item.sku),
        manufacturer,
        models,
        sku: item.sku,
        layout: item.layout,
        variant,
        storageNumber: item.storageNumber,
        sourceRow: item.sourceRow,
        confidence,
        conflictingModels,
        evidence: [
          `Excelrij ${item.sourceRow} koppelt ${models.length} modellen aan hetzelfde artikel.`,
          `${item.sku} wijst naar hangmap ${item.storageNumber} en layout ${item.layout}.`,
          `Leveranciersvariant ${variant} is uit het artikelnummer afgeleid.`,
        ],
        missingEvidence: [
          "Exact fabrikantonderdeelnummer",
          "Goedgekeurde bovenaanzichtfoto",
          "Fysieke droge pastest",
        ],
      };
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence
        || right.models.length - left.models.length
        || left.storageNumber - right.storageNumber,
    );
}

export function createModelGroupDecision(
  proposal: ModelGroupProposal,
  input: ModelGroupReviewInput,
  metadata: DecisionMetadata,
): ModelGroupDecision {
  const reviewer = metadata.reviewer.trim();
  if (!reviewer) {
    throw new ModelGroupReviewError("Een persoonlijke beoordelaar is verplicht.");
  }

  const manufacturerPartNumber = input.manufacturerPartNumber.trim();
  const photoReference = input.photoReference.trim();
  const notes = input.notes.trim();

  if (input.status === "approved") {
    if (proposal.conflictingModels.length > 0 && notes.length < 10) {
      throw new ModelGroupReviewError(
        "Beschrijf bij conflicterende modellen waarom deze combinatie toch is goedgekeurd.",
      );
    }
    if (manufacturerPartNumber.length < 3) {
      throw new ModelGroupReviewError("Vul het gecontroleerde fabrikantonderdeelnummer in.");
    }
    if (photoReference.length < 3) {
      throw new ModelGroupReviewError("Vul een herleidbare foto- of documentreferentie in.");
    }
    const missingCheck = requiredApprovalEvidence.find(
      (key) => !input.evidence[key],
    );
    if (missingCheck) {
      throw new ModelGroupReviewError(
        "Goedkeuren kan pas nadat variant, onderdeelnummer, foto en droge pastest zijn bevestigd.",
      );
    }
  } else if (notes.length < 5) {
    throw new ModelGroupReviewError("Leg bij afwijzen kort vast waarom het voorstel niet klopt.");
  }

  return {
    ...input,
    manufacturerPartNumber,
    photoReference,
    notes,
    id: metadata.id,
    proposalId: proposal.id,
    decidedAt: metadata.decidedAt,
    reviewer,
  };
}

export class ModelGroupReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelGroupReviewError";
  }
}

export function latestModelGroupDecisions(
  decisions: ModelGroupDecision[],
) {
  const latest = new Map<string, ModelGroupDecision>();
  for (const decision of [...decisions].sort((left, right) =>
    left.decidedAt.localeCompare(right.decidedAt),
  )) {
    latest.set(decision.proposalId, decision);
  }
  return latest;
}

function proposalName(
  manufacturer: string,
  models: string[],
  sku: string,
) {
  const family = mostCommonFamily(models);
  return `${manufacturer}${family ? ` ${family}` : ""} · ${sku}`;
}

function mostCommonFamily(models: string[]) {
  const manufacturer = inferManufacturer(models[0]);
  const counts = new Map<string, number>();
  for (const model of models) {
    const token = model
      .slice(manufacturer.length)
      .trim()
      .split(/\s+/)
      .find((part) => /[a-z]/i.test(part) && !/\d/.test(part));
    if (!token) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0]
    ?? "";
}

function inferManufacturer(model: string) {
  const normalized = model.trim();
  const known = [
    "Dell",
    "HP",
    "Lenovo",
    "Fujitsu",
    "Acer",
    "Asus",
    "Microsoft",
    "Medion",
    "Toshiba",
    "Dynabook",
    "MSI",
  ];
  return known.find((manufacturer) =>
    normalized.toLowerCase().startsWith(manufacturer.toLowerCase()),
  ) ?? normalized.split(/\s+/)[0] ?? "Onbekend";
}

function uniqueModels(models: string[]) {
  return [...new Map(
    models
      .map((model) => model.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .map((model) => [normalizeModel(model), model] as const),
  ).values()];
}

function normalizeModel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}
