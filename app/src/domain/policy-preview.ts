import { recommendConversion, type ConversionMethodId } from "./conversion-policy";
import { normalizeLayoutName, targetLayoutOptions } from "./keyboard-layouts";
import type { LayoutRule, OperationsPolicy, PriceBand } from "./operations";

/**
 * Wat de werkvloer met deze instellingen te zien krijgt.
 *
 * Het instellingenscherm was een rij keuzelijsten zonder gevolg in beeld: je
 * zette iets om en moest maar aannemen dat het klopte. Deze tabel rekent het
 * echte advies uit — met dezelfde functie die de werkvloer gebruikt, zodat er
 * niets uiteen kan lopen — en laat er meteen bij zien waar het vandaan komt:
 * een uitzondering die je zelf hebt gezet, of de gewone waarderegel.
 *
 * De aanname is een normale dag: alles op voorraad en technisch geschikt. Een
 * lege hangmap is geen beleid maar een situatie, en die hoort hier niet de
 * uitkomst te kleuren.
 */

export type PolicyPreviewCell = {
  /** Wat de werkvloer krijgt als alles voorhanden is. */
  method: ConversionMethodId;
  /** Wat de werkvloer krijgt als die eerste keuze niet kan. */
  ifBlocked: ConversionMethodId;
  /** De regel die hier geldt, als die er is. */
  rule: LayoutRule | null;
  /**
   * De taal waar de regel vandaan komt. Meestal deze rij zelf, maar niet
   * altijd: QWERTY NL wordt als QWERTY US geprint, dus een regel op de één
   * geldt ook voor de ander.
   */
  from: string;
};

export type PolicyPreviewRow = {
  layout: string;
  label: string;
  /** Wat een goedkope laptop krijgt, onder de waardegrens. */
  below: PolicyPreviewCell;
  /** Wat een dure laptop krijgt, op of boven de waardegrens. */
  above: PolicyPreviewCell;
};

const allOn = {
  loose_stickers: true,
  noviply_sheet: true,
  printed_sticker: true,
  direct_reprint: true,
};

function adviceFor(
  policy: OperationsPolicy,
  directPrintLayouts: string[],
  targetLayout: string,
  saleValueEur: number,
  blocked: ConversionMethodId | null = null,
) {
  // Om te laten zien wat er gebeurt als de eerste keuze niet kan, doen we net
  // alsof die methode niet beschikbaar is — precies wat er op de werkvloer aan
  // de hand is bij een lege hangmap.
  const enabled = { ...allOn, ...policy.methodEnabled };
  const available = blocked && blocked !== "none"
    ? { ...enabled, [blocked]: false }
    : enabled;

  return recommendConversion({
    saleValueEur,
    thresholdEur: policy.thresholdEur,
    // Een laptop die al de goede taal heeft krijgt "geen conversie", en dan
    // zegt de tabel niets over het beleid. QWERTY US is wat er in de praktijk
    // binnenkomt — behalve als dat juist het doel is, of eraan gelijkstaat:
    // NL wordt ook als QWERTY US geprint.
    currentLayout: normalizeLayoutName(targetLayout) === normalizeLayoutName("QWERTY US")
      ? "AZERTY FR"
      : "QWERTY US",
    targetLayout,
    workload: policy.workload,
    available,
    compatible: allOn,
    directPrintLayouts,
    layoutRules: policy.layoutRules,
  }).primary;
}

/**
 * De regel die voor deze taal en prijsklasse geldt. Dezelfde keuze als de
 * motor maakt: een regel voor déze klasse gaat voor een regel die voor beide
 * geldt, en de vergelijking is genormaliseerd — anders zegt deze tabel
 * "verkoopwaarde" terwijl er wel degelijk een uitzondering geldt.
 */
export function ruleFor(policy: OperationsPolicy, layout: string, band: PriceBand) {
  const matching = policy.layoutRules.filter((rule) =>
    normalizeLayoutName(rule.layout) === normalizeLayoutName(layout));
  return matching.find((rule) => rule.band === band)
    ?? matching.find((rule) => rule.band === undefined)
    ?? null;
}

export function policyPreview(
  policy: OperationsPolicy,
  directPrintLayouts: string[],
): PolicyPreviewRow[] {
  const goedkoop = Math.max(1, policy.thresholdEur - 100);
  const duur = policy.thresholdEur + 100;

  function cell(layout: string, band: PriceBand): PolicyPreviewCell {
    const waarde = band === "below" ? goedkoop : duur;
    const method = adviceFor(policy, directPrintLayouts, layout, waarde);
    const rule = ruleFor(policy, layout, band);
    return {
      method,
      ifBlocked: adviceFor(policy, directPrintLayouts, layout, waarde, method),
      rule,
      from: rule?.layout ?? "",
    };
  }

  return targetLayoutOptions.map((option) => ({
    layout: option.value,
    label: option.label,
    below: cell(option.value, "below"),
    above: cell(option.value, "above"),
  }));
}
