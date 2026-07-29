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
  /**
   * De layouts die de toetsenbordsprinter aankan. Leeg betekent: nog niet
   * ingevuld — dan houden we alles open in plaats van alles te blokkeren.
   */
  directPrintLayouts: z.array(z.string()).default([]),
  /**
   * Uitzonderingen per doeltaal. Zonder deze koos het advies puur op
   * verkoopwaarde, en dat klopt niet altijd: "Nederlands altijd met de
   * premiumsticker" is beleid, geen programmeerwerk.
   */
  layoutRules: z.array(z.object({
    layout: z.string().min(2).max(40),
    method: z.enum([
      "loose_stickers",
      "noviply_sheet",
      "printed_sticker",
      "direct_reprint",
    ]),
    note: z.string().max(200).default(""),
  })).max(40).default([]),
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
  /**
   * Gezet wanneer deze laptop eigenlijk een toetsenbordsprint hoorde te krijgen
   * en daar niet doorheen kwam. Die gevallen moeten naar Roemenië, en de sticker
   * die er in plaats van komt moet meteen bij Noviply aangevraagd worden.
   */
  fellBackFrom?: OperationalMethodId;
};

export type OperationalMethodId = Exclude<ConversionMethodId, "none">;

/** Kan de toetsenbordsprinter deze layout aan? */
export function directPrintCovers(layouts: string[], targetLayout: string) {
  // Nog niets ingevuld: dan is er geen reden om iets te blokkeren.
  if (layouts.length === 0) return true;
  return layouts.some((layout) => normalizeLayout(layout) === normalizeLayout(targetLayout));
}

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
  /** Waar het materiaal vandaan komt; leeg wanneer er niets besteld wordt. */
  supplier: string;
};

export const conversionMethods: Record<ConversionMethodId, ConversionMethodProfile> = {
  none: {
    name: "Geen conversie",
    tier: 0,
    note: "Deze laptop hoeft niet omgezet te worden",
    tone: "none",
    supplier: "",
  },
  loose_stickers: {
    name: "Basisstickers",
    tier: 1,
    note: "Tijdelijke, voordelige oplossing",
    tone: "basic",
    supplier: "China",
  },
  noviply_sheet: {
    name: "Noviply Voorraadstickers",
    tier: 2,
    note: "Standaard voorraad, voor dagelijks gebruik",
    tone: "stock",
    supplier: "Noviply",
  },
  printed_sticker: {
    name: "Noviply Premium Stickers",
    tier: 3,
    note: "Extra sterke lijmlaag, duurzamere variant",
    tone: "premium",
    supplier: "Noviply",
  },
  direct_reprint: {
    name: "Professionele Toetsenbordsprint",
    tier: 4,
    note: "Permanente, fabriekwaardige oplossing",
    supplier: "Notebook Service (Roemenië)",
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

  const printerCovers = directPrintCovers(input.directPrintLayouts, input.targetLayout);
  const canUse = (method: Exclude<ConversionMethodId, "none">) =>
    input.available[method]
    && input.compatible[method]
    // Een advies dat de printer niet kan uitvoeren is geen advies.
    && (method !== "direct_reprint" || printerCovers);

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

  // Geldt er een uitzondering voor deze taal, dan gaat die voor op de
  // waarderegel — mits de methode überhaupt kan.
  const layoutRule = input.layoutRules.find(
    (rule) => normalizeLayout(rule.layout) === normalizeLayout(input.targetLayout),
  );
  if (layoutRule && usable.includes(layoutRule.method)) {
    return {
      primary: layoutRule.method,
      alternatives: usable.filter((method) => method !== layoutRule.method),
      reason: layoutRule.note.trim()
        || `Voor ${input.targetLayout} is ${methodLabel(layoutRule.method)} als vaste keuze ingesteld.`,
      warnings,
      policy: { thresholdEur: input.thresholdEur, rule: "layout_rule" },
    };
  }
  if (layoutRule) {
    warnings.push(
      `Voor ${input.targetLayout} staat ${methodLabel(layoutRule.method)} ingesteld, `
      + "maar die is nu niet beschikbaar of niet geschikt.",
    );
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

  // De toetsenbordsprinter kan deze taal niet: dat is geen storing maar een
  // grens, en de medewerker hoort te weten waarom hij iets anders krijgt.
  const blockedByPrinter = isPremium
    && !printerCovers
    && input.available.direct_reprint
    && input.compatible.direct_reprint;

  if (blockedByPrinter) {
    warnings.push(
      `${methodLabel("direct_reprint")} kan deze layout (${input.targetLayout}) niet printen. `
      + "Vraag de sticker meteen aan bij Noviply en meld dit model bij Notebook Service.",
    );
  } else if (primary !== preferred[0]) {
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
    reason: blockedByPrinter
      ? `${reason} Deze layout kan de toetsenbordsprinter echter niet aan, dus valt het advies terug op ${methodLabel(primary)}.`
      : reason,
    warnings,
    policy: { thresholdEur: input.thresholdEur, rule: blockedByPrinter ? "direct_print_out_of_scope" : rule },
    ...(blockedByPrinter ? { fellBackFrom: "direct_reprint" as const } : {}),
  };
}

function normalizeLayout(value: string) {
  return normalizeLayoutName(value);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}
