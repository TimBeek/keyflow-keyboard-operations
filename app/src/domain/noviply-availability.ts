/**
 * Wat Noviply niet kan printen, en wat dat betekent voor het volgende advies.
 *
 * Meldt Noviply bij een aanvraag dat ze het model niet hebben, dan is dat geen
 * eenmalige tegenvaller: de volgende laptop van hetzelfde model loopt tegen
 * precies dezelfde muur. Zonder dit ging de app vrolijk opnieuw de
 * premiumsticker adviseren, deed de werkvloer opnieuw een aanvraag, en kwam er
 * opnieuw "we hebben dit model niet" terug — met de laptop al die tijd apart.
 *
 * Niet elke afwijzing hoort zo te werken. "Het materiaal is op" is morgen
 * voorbij. Daarom kiest Noviply bij het afwijzen een reden, en tellen alleen de
 * twee blijvende redenen mee voor het advies.
 */

export const unavailableReasons = ["model_unknown", "layout_unknown", "temporary"] as const;

export type UnavailableReason = (typeof unavailableReasons)[number];

/** Alleen deze twee zeggen iets over morgen. */
export function reasonBlocksFuture(reason: UnavailableReason) {
  return reason === "model_unknown" || reason === "layout_unknown";
}

export type NoviplyUnavailableRecord = {
  id: string;
  model: string;
  modelKey: string;
  /** Leeg betekent: geen enkele taal. */
  layout: string;
  reason: UnavailableReason;
  note: string;
  recordedAt: string;
  recordedBy: string;
};

/** "HP ProBook 430 G3" en "hp probook 430 g3" zijn dezelfde laptop. */
export function modelKey(model: string) {
  return model.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Voor het samenvoegen van alles wat over dezelfde taal gaat. */
export function layoutKey(layout: string) {
  return layout.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Kan Noviply hier een premiumsticker voor printen?
 *
 * Een regel zonder taal geldt voor het hele model — dan hebben ze het
 * toetsenbord van dat model helemaal niet. Een regel mét taal geldt alleen
 * daarvoor: het model kennen ze wel, die ene taal niet.
 */
export function noviplyBlockedFor(
  records: NoviplyUnavailableRecord[],
  model: string,
  layout: string,
): NoviplyUnavailableRecord | null {
  const gezochtModel = modelKey(model);
  if (!gezochtModel) return null;
  const gezochteTaal = layoutKey(layout);

  return records.find((record) =>
    record.modelKey === gezochtModel
    && (record.layout === "" || layoutKey(record.layout) === gezochteTaal)) ?? null;
}

export function unavailableReasonLabel(reason: UnavailableReason) {
  switch (reason) {
    case "model_unknown":
      return "Noviply heeft dit model niet";
    case "layout_unknown":
      return "Noviply heeft deze taal niet voor dit model";
    case "temporary":
    default:
      return "Noviply kon het deze keer niet printen";
  }
}

/** Wat Michael op zijn scherm leest; dat is Engelstalig. */
export function unavailableReasonEnglish(reason: UnavailableReason) {
  switch (reason) {
    case "model_unknown":
      return "We do not have this model";
    case "layout_unknown":
      return "We cannot do this language for this model";
    case "temporary":
    default:
      return "Not possible right now";
  }
}

/**
 * Waar de melding op slaat. Kennen ze het model niet, dan heeft het geen zin om
 * het per taal vast te leggen.
 */
export function scopeForReason(reason: UnavailableReason, layout: string) {
  return reason === "model_unknown" ? "" : layout.trim();
}
