import { z } from "zod";

export const conversionMethodIds = [
  "none",
  "loose_stickers",
  "noviply_sheet",
  "printed_sticker",
  "direct_reprint",
] as const;

export type ConversionMethodId = (typeof conversionMethodIds)[number];

export const conversionPolicyInputSchema = z.object({
  saleValueEur: z.number().nonnegative(),
  thresholdEur: z.number().positive().default(300),
  currentLayout: z.string().min(2),
  targetLayout: z.string().min(2),
  workload: z.enum(["normal", "busy", "critical"]).default("normal"),
  available: z.object({
    loose_stickers: z.boolean(),
    noviply_sheet: z.boolean(),
    printed_sticker: z.boolean(),
    direct_reprint: z.boolean(),
  }),
  compatible: z.object({
    loose_stickers: z.boolean(),
    noviply_sheet: z.boolean(),
    printed_sticker: z.boolean(),
    direct_reprint: z.boolean(),
  }),
});

export type ConversionPolicyInput = z.input<typeof conversionPolicyInputSchema>;

export type ConversionRecommendation = {
  primary: ConversionMethodId;
  alternatives: ConversionMethodId[];
  reason: string;
  warnings: string[];
  policy: {
    thresholdEur: number;
    rule: string;
  };
};

const labels: Record<ConversionMethodId, string> = {
  none: "Geen conversie",
  loose_stickers: "Losse stickers",
  noviply_sheet: "Noviply voorraadvel",
  printed_sticker: "Sterke printsticker",
  direct_reprint: "Directe keyboardprint",
};

export function methodLabel(method: ConversionMethodId) {
  return labels[method];
}

export function recommendConversion(rawInput: ConversionPolicyInput): ConversionRecommendation {
  const input = conversionPolicyInputSchema.parse(rawInput);
  const warnings: string[] = [];

  if (normalizeLayout(input.currentLayout) === normalizeLayout(input.targetLayout)) {
    return {
      primary: "none",
      alternatives: [],
      reason: "De aanwezige keyboardlayout komt al overeen met de gewenste klantlayout.",
      warnings,
      policy: { thresholdEur: input.thresholdEur, rule: "layout_already_matches" },
    };
  }

  const canUse = (method: Exclude<ConversionMethodId, "none">) =>
    input.available[method] && input.compatible[method];

  const usable = ([
    "direct_reprint",
    "printed_sticker",
    "noviply_sheet",
    "loose_stickers",
  ] as const).filter(canUse);

  if (usable.length === 0) {
    return {
      primary: "none",
      alternatives: [],
      reason: "Geen conversiemethode is zowel beschikbaar als technisch geschikt.",
      warnings: ["Blokkeer de order en laat compatibiliteit, materiaal of printercapaciteit beoordelen."],
      policy: { thresholdEur: input.thresholdEur, rule: "no_usable_method" },
    };
  }

  const isPremium = input.saleValueEur >= input.thresholdEur;
  const isQwertyUs = normalizeLayout(input.targetLayout) === "qwerty us";
  let preferred: Exclude<ConversionMethodId, "none">[];
  let rule: string;
  let reason: string;

  if (isPremium) {
    preferred = ["direct_reprint", "printed_sticker", "noviply_sheet", "loose_stickers"];
    rule = "premium_value";
    reason = `De verkoopwaarde is €${formatAmount(input.saleValueEur)} en ligt op of boven de beleidsgrens van €${formatAmount(input.thresholdEur)}. Directe keyboardprint heeft daarom de voorkeur.`;
  } else if (!isQwertyUs) {
    preferred = ["printed_sticker", "direct_reprint", "noviply_sheet", "loose_stickers"];
    rule = "foreign_layout_below_threshold";
    reason = `De gewenste layout is ${input.targetLayout} en de verkoopwaarde ligt onder €${formatAmount(input.thresholdEur)}. De sterkere printsticker heeft volgens het huidige beleid de voorkeur.`;
  } else {
    preferred = ["noviply_sheet", "direct_reprint", "printed_sticker", "loose_stickers"];
    rule = "qwerty_us_below_threshold";
    reason = `De gewenste layout is QWERTY US en de verkoopwaarde ligt onder €${formatAmount(input.thresholdEur)}. Het bestaande Noviply-voorraadvel is de beschikbare standaardfallback.`;
  }

  const ranked = preferred.filter(canUse);
  const primary = ranked[0];

  if (primary !== preferred[0]) {
    warnings.push(`${methodLabel(preferred[0])} is niet beschikbaar of niet geschikt; het advies gebruikt de eerstvolgende toegestane fallback.`);
  }
  if (primary === "loose_stickers") {
    warnings.push("Losse stickers worden uitgefaseerd en vereisen expliciete goedkeuring.");
  }
  if (primary === "printed_sticker") {
    warnings.push("First-time-right-controle verplicht: verkeerd aanbrengen leidt waarschijnlijk tot herwerk of uitval.");
  }
  if (input.workload !== "normal") {
    warnings.push(`De werkdruk is “${input.workload}”. Afwijken van het advies vereist een geregistreerde reden.`);
  }

  return {
    primary,
    alternatives: ranked.slice(1),
    reason,
    warnings,
    policy: { thresholdEur: input.thresholdEur, rule },
  };
}

function normalizeLayout(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}
