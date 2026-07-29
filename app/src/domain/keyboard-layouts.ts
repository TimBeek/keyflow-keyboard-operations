export const genericNordicLayout = "QWERTY Nordic (nog specificeren)";

export type KeyboardLayoutGroup = "Scandinavisch" | "Veelgebruikt" | "Overig";

export type KeyboardLayoutOption = {
  value: string;
  label: string;
  group: KeyboardLayoutGroup;
  exact: boolean;
};

export type ScandinavianLayoutReference = {
  value: string;
  shortLabel: string;
  keySymbols: string;
  recognition: string;
  caution: string;
};

export const currentLayoutOptions: KeyboardLayoutOption[] = [
  {
    value: genericNordicLayout,
    label: "Nordic / Scandinavisch — nog specificeren",
    group: "Scandinavisch",
    exact: false,
  },
  {
    value: "QWERTY SE/FI",
    label: "QWERTY SE/FI — Zweeds / Fins",
    group: "Scandinavisch",
    exact: true,
  },
  {
    value: "QWERTY NO",
    label: "QWERTY NO — Noors",
    group: "Scandinavisch",
    exact: true,
  },
  {
    value: "QWERTY DK",
    label: "QWERTY DK — Deens",
    group: "Scandinavisch",
    exact: true,
  },
  { value: "QWERTY US", label: "QWERTY US / US International", group: "Veelgebruikt", exact: true },
  { value: "QWERTY NL", label: "QWERTY NL — Nederlands", group: "Veelgebruikt", exact: true },
  { value: "QWERTY UK", label: "QWERTY UK", group: "Veelgebruikt", exact: true },
  { value: "AZERTY FR", label: "AZERTY FR — Frans", group: "Veelgebruikt", exact: true },
  { value: "QWERTZ DE", label: "QWERTZ DE — Duits", group: "Veelgebruikt", exact: true },
  { value: "QWERTY ES", label: "QWERTY ES — Spaans", group: "Overig", exact: true },
  { value: "QWERTY IT", label: "QWERTY IT — Italiaans", group: "Overig", exact: true },
  { value: "QWERTY PT", label: "QWERTY PT — Portugees", group: "Overig", exact: true },
  { value: "QWERTY PL", label: "QWERTY PL — Pools", group: "Overig", exact: true },
];

export const targetLayoutOptions = [
  currentLayoutOptions.find((layout) => layout.value === "QWERTY US"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY NL"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY UK"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY SE/FI"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY NO"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY DK"),
  currentLayoutOptions.find((layout) => layout.value === "AZERTY FR"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTZ DE"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY ES"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY IT"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY PT"),
  currentLayoutOptions.find((layout) => layout.value === "QWERTY PL"),
].filter((layout): layout is KeyboardLayoutOption => Boolean(layout));

export const scandinavianLayoutReferences: ScandinavianLayoutReference[] = [
  {
    value: "QWERTY SE/FI",
    shortLabel: "Zweeds / Fins",
    keySymbols: "Å  Ä  Ö",
    recognition: "Gebruik deze keuze bij de Zweeds/Finse letterset.",
    caution: "Controleer alsnog de fysieke Enter-, Shift- en functietoetsvorm van het laptopmodel.",
  },
  {
    value: "QWERTY NO",
    shortLabel: "Noors",
    keySymbols: "Å  Æ  Ø",
    recognition: "Noors gebruikt deze letterset, maar deelt die met Deens.",
    caution: "Kies Noors pas na vergelijking van de overige symbooltoetsen met een goedgekeurde foto.",
  },
  {
    value: "QWERTY DK",
    shortLabel: "Deens",
    keySymbols: "Å  Æ  Ø",
    recognition: "Deens gebruikt deze letterset, maar deelt die met Noors.",
    caution: "Kies Deens pas na vergelijking van de overige symbooltoetsen met een goedgekeurde foto.",
  },
];

export function requiresExactLayoutChoice(layout: string) {
  return layout === genericNordicLayout;
}

export function isScandinavianLayout(layout: string) {
  return layout === genericNordicLayout
    || scandinavianLayoutReferences.some((reference) => reference.value === layout);
}

/**
 * Een Nederlands toetsenbord is fysiek US International. De voorraadvellen staan
 * daarom als "QWERTY US" in de bron, met NL achteraan het artikelnummer. Wie
 * QWERTY NL kiest bedoelt exact die hangmappen — zowel bij het zoeken van het
 * vel als bij de vraag welke methode de voorkeur heeft.
 */
const layoutAliases: Record<string, string> = {
  "qwerty nl": "qwerty us",
};

export function normalizeLayoutName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return layoutAliases[normalized] ?? normalized;
}
