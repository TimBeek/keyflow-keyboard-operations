export type ModelResolution =
  | { status: "empty"; matches: [] }
  | { status: "none"; matches: [] }
  | { status: "unique"; model: string; matches: [string] }
  | { status: "multiple"; matches: string[] };

export function resolveModelQuery(query: string, models: string[], limit = 6): ModelResolution {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return { status: "empty", matches: [] };

  const uniqueModels = [...new Set(models)];
  const matches = uniqueModels
    .map((model) => ({ model, score: modelScore(model, normalizedQuery) }))
    .filter((candidate) => candidate.score < 99)
    .sort((a, b) => a.score - b.score || a.model.localeCompare(b.model, "nl"))
    .slice(0, limit)
    .map((candidate) => candidate.model);

  if (matches.length === 0) return { status: "none", matches: [] };
  if (matches.length === 1) return { status: "unique", model: matches[0], matches: [matches[0]] };
  return { status: "multiple", matches };
}

export const saleValueBands = [
  { id: "under_100", label: "Lager dan €100", shortLabel: "< €100", min: 0, max: 99 },
  { id: "100_199", label: "€100 – €199", shortLabel: "€100–199", min: 100, max: 199 },
  { id: "200_299", label: "€200 – €299", shortLabel: "€200–299", min: 200, max: 299 },
  { id: "300_399", label: "€300 – €399", shortLabel: "€300–399", min: 300, max: 399 },
  { id: "400_499", label: "€400 – €499", shortLabel: "€400–499", min: 400, max: 499 },
  { id: "500_plus", label: "€500 of hoger", shortLabel: "€500+", min: 500, max: null },
] as const;

export type SaleValueBandId = (typeof saleValueBands)[number]["id"];
export type SaleValueBand = (typeof saleValueBands)[number];

export function getSaleValueBand(id: SaleValueBandId) {
  return saleValueBands.find((band) => band.id === id) ?? saleValueBands[2];
}

export function classifyValueBand(band: SaleValueBand, thresholdEur: number) {
  if (band.max !== null && band.max < thresholdEur) return "below" as const;
  if (band.min >= thresholdEur) return "premium" as const;
  return "overlap" as const;
}

export function policyValueForBand(band: SaleValueBand, thresholdEur: number) {
  const classification = classifyValueBand(band, thresholdEur);
  if (classification === "below") return band.max ?? band.min;
  if (classification === "premium") return band.min;
  return thresholdEur;
}

function modelScore(model: string, normalizedQuery: string) {
  const normalizedModel = normalize(model);
  const modelTokens = normalizedModel.split(" ");
  const queryTokens = normalizedQuery.split(" ");
  const compactModel = normalizedModel.replaceAll(" ", "");
  const compactQuery = normalizedQuery.replaceAll(" ", "");

  if (normalizedModel === normalizedQuery) return 0;
  if (modelTokens.includes(normalizedQuery)) return 1;
  if (queryTokens.every((token) => modelTokens.some((modelToken) => modelToken === token))) return 2;
  if (normalizedModel.startsWith(normalizedQuery)) return 3;
  if (normalizedModel.includes(normalizedQuery)) return 4;
  if (compactModel.includes(compactQuery)) return 5;
  return 99;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}
