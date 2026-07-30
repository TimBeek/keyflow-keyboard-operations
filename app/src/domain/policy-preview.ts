import { recommendConversion, type ConversionMethodId } from "./conversion-policy";
import { normalizeLayoutName, targetLayoutOptions } from "./keyboard-layouts";
import type { OperationsPolicy } from "./operations";

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

export type PolicyPreviewRow = {
  layout: string;
  label: string;
  /** Wat een goedkope laptop krijgt, onder de waardegrens. */
  below: ConversionMethodId;
  /** Wat een dure laptop krijgt, op of boven de waardegrens. */
  above: ConversionMethodId;
  /** Waar de keuze vandaan komt; een uitzondering geldt in beide gevallen. */
  source: "exception" | "value";
  /**
   * De taal waarvan de uitzondering komt. Meestal deze rij zelf, maar niet
   * altijd: QWERTY NL wordt als QWERTY US geprint, dus een regel op de één
   * geldt ook voor de ander. Dat moet je zien staan voordat je hem omzet.
   */
  exceptionFrom: string;
  /** De toelichting die de medewerker bij een uitzondering te zien krijgt. */
  note: string;
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
) {
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
    available: { ...allOn, ...policy.methodEnabled },
    compatible: allOn,
    directPrintLayouts,
    layoutRules: policy.layoutRules,
  }).primary;
}

export function policyPreview(
  policy: OperationsPolicy,
  directPrintLayouts: string[],
): PolicyPreviewRow[] {
  const goedkoop = Math.max(1, policy.thresholdEur - 100);
  const duur = policy.thresholdEur + 100;

  return targetLayoutOptions.map((option) => {
    // Dezelfde vergelijking als de motor gebruikt, anders zegt deze tabel
    // "verkoopwaarde" terwijl er wel degelijk een uitzondering geldt.
    const exception = policy.layoutRules.find((rule) =>
      normalizeLayoutName(rule.layout) === normalizeLayoutName(option.value));
    return {
      layout: option.value,
      label: option.label,
      below: adviceFor(policy, directPrintLayouts, option.value, goedkoop),
      above: adviceFor(policy, directPrintLayouts, option.value, duur),
      source: exception ? "exception" : "value",
      exceptionFrom: exception?.layout ?? "",
      note: exception?.note ?? "",
    };
  });
}
