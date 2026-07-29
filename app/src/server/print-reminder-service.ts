import "server-only";
import type { PrintReminderRecord } from "@/domain/print-reminder";
import { PrintRequestError } from "@/domain/print-requests";
import { requirePermission } from "./authorization-service";
import { database } from "./database";

/**
 * De werkvloer laat Noviply weten dat er te veel blijft liggen.
 *
 * Zonder dit kan de werkvloer alleen wachten, en ziet Noviply een lijstje dat
 * langzaam groeit zonder dat iemand zegt dat het knelt. Eén knop, en aan de
 * andere kant een pop-up die niet te missen is.
 */

type Row = {
  id: string;
  sent_at: Date;
  sent_by_name: string;
  open_count: number;
  acknowledged_at: Date | null;
};

function toRecord(row: Row): PrintReminderRecord {
  return {
    id: row.id,
    sentAt: row.sent_at.toISOString(),
    sentBy: row.sent_by_name,
    openCount: row.open_count,
    acknowledgedAt: row.acknowledged_at ? row.acknowledged_at.toISOString() : null,
  };
}

export async function listPrintReminders(limit = 10) {
  const sql = database();
  const rows = await sql<Row[]>`
    select r.id, r.sent_at, r.open_count, r.acknowledged_at,
           u.display_name as sent_by_name
    from print_reminders r
    join users u on u.id = r.sent_by
    order by r.sent_at desc
    limit ${limit}
  `;
  return rows.map(toRecord);
}

export async function sendPrintReminder(actorId: string) {
  await requirePermission(actorId, "conversion.execute");
  const sql = database();

  return sql.begin(async (transaction) => {
    // Tien keer op de knop mag geen tien pop-ups bij Noviply opleveren.
    const [existing] = await transaction<Row[]>`
      select r.id, r.sent_at, r.open_count, r.acknowledged_at,
             u.display_name as sent_by_name
      from print_reminders r
      join users u on u.id = r.sent_by
      where r.acknowledged_at is null
      limit 1
    `;
    if (existing) {
      return { reminder: toRecord(existing), alreadySent: true };
    }

    // Het aantal komt van de server, niet uit het scherm: anders kan een
    // verouderd tabblad een getal sturen dat allang niet meer klopt.
    const [{ open }] = await transaction<{ open: number }[]>`
      select count(*)::int as open from print_requests where status = 'requested'
    `;
    if (open === 0) {
      throw new PrintRequestError("Er staat niets open bij Noviply.");
    }

    const [inserted] = await transaction<{ id: string }[]>`
      insert into print_reminders (sent_by, open_count)
      values (${actorId}, ${open})
      returning id
    `;
    const [row] = await transaction<Row[]>`
      select r.id, r.sent_at, r.open_count, r.acknowledged_at,
             u.display_name as sent_by_name
      from print_reminders r
      join users u on u.id = r.sent_by
      where r.id = ${inserted.id}
    `;
    return { reminder: toRecord(row), alreadySent: false };
  });
}

export async function acknowledgePrintReminder(id: string, actorId: string) {
  await requirePermission(actorId, "print.fulfil");
  const sql = database();
  const [row] = await sql<{ id: string }[]>`
    update print_reminders
    set acknowledged_at = now(), acknowledged_by = ${actorId}
    where id = ${id} and acknowledged_at is null
    returning id
  `;
  if (!row) {
    throw new PrintRequestError("Deze melding is al gezien.");
  }
  return { acknowledged: true };
}
