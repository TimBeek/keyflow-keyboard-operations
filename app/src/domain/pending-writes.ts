/**
 * Wat te doen als de verbinding wegvalt terwijl er een laptop op de bank staat.
 *
 * Stilvallen is geen optie: de medewerker moet door kunnen. De handeling gaat
 * daarom in een wachtrij en wordt later alsnog verstuurd. Omdat elke regel zijn
 * eigen idempotentiesleutel meedraagt, kan hij niet dubbel aankomen — ook niet
 * als hij half is doorgekomen en we het opnieuw proberen.
 */

export type PendingWrite =
  | { kind: "mutation"; id: string; payload: Record<string, unknown> }
  | { kind: "printRequest"; id: string; payload: Record<string, unknown> }
  | { kind: "settlePrintRequest"; id: string; requestId: string; payload: Record<string, unknown> }
  | { kind: "conversion"; id: string; payload: Record<string, unknown> }
  | { kind: "stockCount"; id: string; payload: Record<string, unknown> }
  | { kind: "modelGroupReview"; id: string; payload: Record<string, unknown> }
  | { kind: "compatibilityEvidence"; id: string; payload: Record<string, unknown> }
  | { kind: "skuOverride"; id: string; payload: Record<string, unknown> };

export const PENDING_WRITES_KEY = "keyflow.pending-writes.v1";

/** Boven dit aantal is er iets structureel mis en helpt bewaren niet meer. */
export const pendingWriteLimit = 500;

export function addPendingWrite(queue: PendingWrite[], write: PendingWrite) {
  // Dezelfde sleutel twee keer in de wachtrij zou tweemaal een poging kosten
  // zonder ooit iets extra's op te leveren.
  if (queue.some((item) => item.id === write.id)) return queue;
  const next = [...queue, write];
  return next.length > pendingWriteLimit
    ? next.slice(next.length - pendingWriteLimit)
    : next;
}

export function removePendingWrite(queue: PendingWrite[], id: string) {
  return queue.filter((item) => item.id !== id);
}

export function readPendingWrites(raw: string | null): PendingWrite[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingWrite =>
      Boolean(item)
      && typeof item === "object"
      && typeof item.id === "string"
      && typeof item.kind === "string"
      && [
        "mutation", "printRequest", "settlePrintRequest", "conversion",
        "stockCount", "modelGroupReview", "compatibilityEvidence", "skuOverride",
      ].includes(item.kind)
      && Boolean(item.payload));
  } catch {
    // Een onleesbare wachtrij is erger dan een lege: hij zou elke poging
    // blijven blokkeren.
    return [];
  }
}

/** Wat de gebruiker hierover moet weten, in gewone taal. */
export function pendingWritesMessage(count: number) {
  if (count === 0) return "";
  if (count === 1) return "1 handeling wacht op verbinding en wordt vanzelf verstuurd.";
  return `${count} handelingen wachten op verbinding en worden vanzelf verstuurd.`;
}
