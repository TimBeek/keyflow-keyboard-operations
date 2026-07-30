import "server-only";
import { database } from "./database";
import { requirePermission } from "./authorization-service";

/**
 * Onverwachte fouten opschrijven waar iemand ze ziet.
 *
 * Ze gingen naar de console van de server. Die leest niemand, dus kwam een
 * kapotte route pas aan het licht als iemand belde. Nu komen ze in een tabel en
 * daarmee in het scherm van management, naast de andere dingen waar iemand iets
 * mee moet.
 *
 * Twee regels waar dit zich aan houdt: opschrijven mag nooit het verzoek zelf
 * laten mislukken, en dezelfde fout op dezelfde plek is één regel met een teller
 * — anders vult een lus in een scherm de tabel in een minuut.
 */

/** Bewust niet "ErrorEvent": zo heet het ingebouwde type van de browser al. */
export type AppErrorEvent = {
  id: string;
  source: "server" | "browser";
  origin: string;
  message: string;
  detail: string;
  role: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
};

/** Genoeg om te zoeken, niet zo veel dat het een dump wordt. */
const maxMessage = 300;
const maxDetail = 1200;

function trim(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function recordError(input: {
  source: "server" | "browser";
  origin?: string;
  message: unknown;
  detail?: unknown;
  role?: string;
}) {
  const message = trim(input.message, maxMessage);
  if (!message) return;

  try {
    const sql = database();
    await sql`
      insert into error_events (source, origin, message, detail, role)
      values (
        ${input.source}, ${trim(input.origin, 200)}, ${message},
        ${trim(input.detail, maxDetail)}, ${trim(input.role, 40)}
      )
      on conflict (source, origin, message) where resolved_at is null
      do update set
        last_seen_at = now(),
        occurrences = error_events.occurrences + 1,
        detail = excluded.detail
    `;
  } catch {
    // Opschrijven mag nooit het verzoek laten mislukken. Gaat de database zelf
    // stuk, dan is dat het probleem — niet dat we het niet konden noteren.
  }
}

type Row = {
  id: string;
  source: "server" | "browser";
  origin: string;
  message: string;
  detail: string;
  role: string;
  first_seen_at: Date;
  last_seen_at: Date;
  occurrences: number;
};

/** Alleen wie er iets mee kan hoeft ze te zien. */
export async function canSeeFaults(actorId: string) {
  try {
    await requirePermission(actorId, "policies.manage");
    return true;
  } catch {
    return false;
  }
}

export async function listOpenErrors(limit = 25): Promise<AppErrorEvent[]> {
  const sql = database();
  const rows = await sql<Row[]>`
    select id, source, origin, message, detail, role,
           first_seen_at, last_seen_at, occurrences
    from error_events
    where resolved_at is null
    order by last_seen_at desc
    limit ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    origin: row.origin,
    message: row.message,
    detail: row.detail,
    role: row.role,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    occurrences: row.occurrences,
  }));
}

/** Afgehandeld: uit beeld, maar blijft staan als bewijs dat het er was. */
export async function resolveError(id: string, actorId: string) {
  await requirePermission(actorId, "policies.manage");
  const sql = database();
  await sql`
    update error_events
    set resolved_at = now(), resolved_by = ${actorId}
    where id = ${id} and resolved_at is null
  `;
  return { resolved: true };
}
