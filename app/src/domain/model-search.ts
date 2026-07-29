/**
 * Wat de werkvloer kan invoeren bij "Welke laptop?".
 *
 * Tot nu toe alleen de 376 modelnamen die aan een hangmap hangen. Maar er gaan
 * bijna tweeduizend modellen door de handen — precies de reden dat er vier
 * oplossingen zijn. Een laptop zonder hangmap was daardoor niet eens in te
 * typen, terwijl juist die de losse stickers of de toetsenbordsprint nodig
 * heeft.
 *
 * Het onderscheid blijft wel zichtbaar: staat er een hangmap achter, dan is er
 * een voorraadvel. Zo niet, dan komt het advies uit op iets anders.
 */

import { laptopModels } from "@/data/laptop-models.generated";

export type ModelSource = "hangmap" | "database";

export type ModelChoice = {
  name: string;
  source: ModelSource;
  /** Null als de bron het niet eenduidig zegt. */
  numpad: boolean | null;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * De hangmapmodellen eerst: daar ligt een vel voor klaar. Daarna de rest uit de
 * laptopdatabase, zonder wat er al bij stond.
 */
export function buildModelChoices(catalogModels: string[]): ModelChoice[] {
  const seen = new Set(catalogModels.map(normalize));
  const choices: ModelChoice[] = catalogModels.map((name) => ({
    name,
    source: "hangmap",
    numpad: null,
  }));

  for (const entry of laptopModels) {
    const key = normalize(entry.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    choices.push({ name: entry.name, source: "database", numpad: entry.numpad });
  }

  return choices;
}

/**
 * Zoeken op wat een medewerker intypt: meestal het kale modelnummer van de
 * sticker op de onderkant. Woorden mogen in elke volgorde staan.
 */
export function searchModels(
  choices: ModelChoice[],
  query: string,
  limit = 8,
): ModelChoice[] {
  const words = normalize(query).split(" ").filter((word) => word.length >= 2);
  if (words.length === 0) return [];

  return choices
    .map((choice) => ({ choice, score: scoreChoice(choice, words) }))
    .filter((candidate) => candidate.score < 99)
    .sort((left, right) =>
      left.score - right.score
      // Bij gelijke score wint de hangmap: daar ligt een vel voor klaar.
      || Number(left.choice.source === "database") - Number(right.choice.source === "database")
      || left.choice.name.localeCompare(right.choice.name, "nl", { numeric: true }))
    .slice(0, limit)
    .map((candidate) => candidate.choice);
}

function scoreChoice(choice: ModelChoice, words: string[]) {
  const name = normalize(choice.name);
  const tokens = name.split(" ");

  let score = 0;
  for (const word of words) {
    // Een woord dat precies een deel van de naam is telt zwaarder dan een woord
    // dat er ergens middenin voorkomt.
    if (tokens.includes(word)) continue;
    if (tokens.some((token) => token.startsWith(word))) { score += 1; continue; }
    if (name.includes(word)) { score += 3; continue; }
    return 99;
  }
  // Kortere namen die alles bevatten zijn preciezer dan lange.
  return score * 10 + Math.min(9, Math.floor(tokens.length / 2));
}
