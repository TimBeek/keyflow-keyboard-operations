import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import { inventoryQuantity } from "./inventory-quantities";
import { batchLabel, type PrintBatch } from "./print-batch";
import type { PrintRequestRecord } from "./print-requests";
import {
  stickerVerificationFailureLabel,
  type StickerVerificationReport,
} from "./sticker-verification";

/**
 * Alles waar iemand iets mee moet, op één plek.
 *
 * Problemen ontstonden op vier plekken en werden op vier plekken bewaard: een
 * vel dat niet paste stond bij management, wat Noviply niet kon printen stond in
 * hun eigen lijst, een lege hangmap zag je alleen als je de voorraad opende, en
 * een taalcode die de app niet kent stond boven een printronde. Wie moest weten
 * "wat loopt er vandaag mis" had vier schermen nodig.
 *
 * Dit brengt ze samen. Bewust afgeleid en niet opgeslagen: een probleem dat is
 * opgelost verdwijnt dan vanzelf, in plaats van dat iemand het moet afvinken.
 */

export type AttentionKind =
  | "sheet_mismatch"
  | "cannot_print"
  | "empty_folder"
  | "unknown_language";

export type AttentionItem = {
  id: string;
  kind: AttentionKind;
  /** Wat er aan de hand is, in één regel. */
  title: string;
  /** Waarom, of wat eraan te doen is. */
  detail: string;
  orderReference: string;
  /** Wanneer het speelde; leeg voor dingen die geen moment hebben, zoals een lege hangmap. */
  occurredAt: string;
};

export const attentionKindLabel: Record<AttentionKind, string> = {
  sheet_mismatch: "Vel paste niet",
  cannot_print: "Noviply kan niet printen",
  empty_folder: "Hangmap leeg",
  unknown_language: "Taalcode onbekend",
};

export type AttentionInput = {
  verificationReports: StickerVerificationReport[];
  printRequests: PrintRequestRecord[];
  printBatches: PrintBatch[];
  catalog: InventoryCatalogItem[];
  quantities: Record<string, number>;
};

export function attentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. De werkvloer meldt dat een vel niet paste. Een geslaagde controle hoeft
  //    niemand te zien; een mislukte wel, want dan klopt er iets niet in de bron.
  for (const report of input.verificationReports) {
    if (report.outcome === "passed") continue;
    items.push({
      id: `mismatch-${report.id}`,
      kind: "sheet_mismatch",
      title: `${report.model} · hangmap ${report.storageNumber}`,
      detail: stickerVerificationFailureLabel(report.failureReason ?? "other"),
      orderReference: report.orderReference ?? "",
      occurredAt: report.occurredAt,
    });
  }

  // 2. Wat Noviply niet kan printen — uit de losse aanvragen én uit de rondes.
  //    De reden is het enige waar de werkvloer mee verder kan.
  for (const request of input.printRequests) {
    if (request.status !== "not_printable") continue;
    items.push({
      id: `request-${request.id}`,
      kind: "cannot_print",
      title: `${request.model} · ${request.layout}`,
      detail: request.note || "Geen reden opgegeven.",
      orderReference: request.orderReference,
      occurredAt: request.handledAt ?? request.requestedAt,
    });
  }
  for (const batch of input.printBatches) {
    for (const row of batch.rows) {
      if (row.status !== "not_printable") continue;
      items.push({
        id: `run-${row.id}`,
        kind: "cannot_print",
        title: `${row.model} · ${row.layout || row.languageCode}`,
        detail: `${row.note || "Geen reden opgegeven."} (${batchLabel(batch)})`,
        orderReference: row.orderReference,
        occurredAt: row.handledAt ?? "",
      });
    }
  }

  // 3. Een hangmap die leeg is. Geen moment eraan verbonden: hij is leeg tot
  //    iemand hem vult, en verdwijnt vanzelf uit deze lijst zodra dat gebeurt.
  for (const item of input.catalog) {
    if (item.dataQuality !== "ready") continue;
    if (inventoryQuantity(input.quantities, item) !== 0) continue;
    items.push({
      id: `empty-${item.catalogKey}`,
      kind: "empty_folder",
      title: `Hangmap ${item.storageNumber} · ${item.model}`,
      detail: `${item.sku} — niets meer op voorraad.`,
      orderReference: "",
      occurredAt: "",
    });
  }

  // 4. Een landcode uit een printronde die de app niet kent. De regel is niet
  //    geweigerd — Noviply print hem toch — maar iemand hoort ernaar te kijken.
  for (const batch of input.printBatches) {
    if (batch.deletedAt !== null) continue;
    for (const row of batch.rows) {
      if (row.layout !== "") continue;
      items.push({
        id: `taal-${row.id}`,
        kind: "unknown_language",
        title: `${row.model} · code “${row.languageCode}”`,
        detail: `Staat in ${batchLabel(batch)}; KeyFlow kent deze taal niet.`,
        orderReference: row.orderReference,
        occurredAt: batch.uploadedAt,
      });
    }
  }

  // Het meest recente bovenaan; wat geen moment heeft komt daarachter.
  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

/**
 * Op volgorde van hoe hard het werk stilstaat.
 *
 * Een vel dat niet paste betekent dat er nu iemand met een laptop staat te
 * wachten. Een model dat Noviply niet kan printen houdt een order tegen. Een
 * lege hangmap merk je pas bij de vólgende laptop van dat model, en een
 * onbekende taalcode staat alleen een regel in een printronde in de weg. In die
 * volgorde hoort management ze te zien, niet in de volgorde waarin ze toevallig
 * binnenkwamen.
 */
export const attentionPriority: AttentionKind[] = [
  "sheet_mismatch",
  "cannot_print",
  "empty_folder",
  "unknown_language",
];

export function attentionByKind(items: AttentionItem[]) {
  const per = new Map<AttentionKind, AttentionItem[]>();
  for (const kind of attentionPriority) {
    const van = items.filter((item) => item.kind === kind);
    if (van.length > 0) per.set(kind, van);
  }
  // Een soort die hier nog niet in de volgorde staat mag niet stilletjes
  // wegvallen; die komt achteraan.
  for (const item of items) {
    if (!per.has(item.kind)) per.set(item.kind, items.filter((x) => x.kind === item.kind));
  }
  return per;
}
