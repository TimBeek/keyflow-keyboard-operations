import { z } from "zod";
import { normalizeLayoutName } from "./keyboard-layouts";

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
  saleValueLabel: z.string().min(1).max(40).optional(),
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

/**
 * De vier oplossingen in oplopende kwaliteit. De naam alleen zei niets over de
 * rangorde — "Sterke printsticker" klinkt niet zwaarder dan "voorraadvel" —
 * dus staat het niveau er nu expliciet bij, in sterren en in kleur.
 */
export type ConversionMethodProfile = {
  name: string;
  tier: 0 | 1 | 2 | 3 | 4;
  note: string;
  tone: "none" | "basic" | "stock" | "premium" | "professional";
};

export const conversionMethods: Record<ConversionMethodId, ConversionMethodProfile> = {
  none: {
    name: "Geen conversie",
    tier: 0,
    note: "Deze laptop hoeft niet omgezet te worden",
    tone: "none",
  },
  loose_stickers: {
    name: "Basisstickers",
    tier: 1,
    note: "Tijdelijke, voordelige oplossing",
    tone: "basic",
  },
  noviply_sheet: {
    name: "Noviply Voorraadstickers",
    tier: 2,
    note: "Standaard voorraad, voor dagelijks gebruik",
    tone: "stock",
  },
  printed_sticker: {
    name: "Noviply Premium Stickers",
    tier: 3,
    note: "Extra sterke lijmlaag, duurzamere variant",
    tone: "premium",
  },
  direct_reprint: {
    name: "Professionele Toetsenbordsprint",
    tier: 4,
    note: "Permanente, fabriekwaardige oplossing",
    tone: "professional",
  },
};

export function methodLabel(method: ConversionMethodId) {
  return conversionMethods[method].name;
}

export function methodProfile(method: ConversionMethodId) {
  return conversionMethods[method];
}

/** Sterren zeggen de rangorde ook zonder kleur — kleurenblindheid meegerekend. */
export function methodStars(method: ConversionMethodId) {
  return "★".repeat(conversionMethods[method].tier);
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
  const saleValueClause = input.saleValueLabel
    ? `valt in de klasse ${input.saleValueLabel}`
    : `is €${formatAmount(input.saleValueEur)}`;
  const isQwertyUs = normalizeLayout(input.targetLayout) === "qwerty us";
  let preferred: Exclude<ConversionMethodId, "none">[];
  let rule: string;
  let reason: string;

  if (isPremium) {
    preferred = ["direct_reprint", "printed_sticker", "noviply_sheet", "loose_stickers"];
    rule = "premium_value";
    reason = `De verkoopwaarde ${saleValueClause} en ligt op of boven de beleidsgrens van €${formatAmount(input.thresholdEur)}. Directe keyboardprint heeft daarom de voorkeur.`;
  } else if (!isQwertyUs) {
    preferred = ["printed_sticker", "direct_reprint", "noviply_sheet", "loose_stickers"];
    rule = "foreign_layout_below_threshold";
    reason = `De gewenste layout is ${input.targetLayout} en de verkoopwaarde ligt onder €${formatAmount(input.thresholdEur)}. De sterkere printsticker heeft volgens het huidige beleid de voorkeur.`;
  } else {
    preferred = ["noviply_sheet", "direct_reprint", "printed_sticker", "loose_stickers"];
    rule = "qwerty_us_below_threshold";
    reason = `De gewenste layout is ${input.targetLayout} en de verkoopwaarde ligt onder €${formatAmount(input.thresholdEur)}. Het bestaande Noviply-voorraadvel is de beschikbare standaardfallback.`;
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
  return normalizeLayoutName(value);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}
