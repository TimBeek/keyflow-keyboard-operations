import "server-only";
import { z } from "zod";
import {
  PrinterCheckError,
  validateAnswer,
  type PrinterCheckRecord,
} from "@/domain/printer-check";
import { requirePermission } from "./authorization-service";
import { database } from "./database";
import { databaseUuidSchema } from "./validation";

const askSchema = z.object({
  question: z.string().max(200).default(""),
  actorId: databaseUuidSchema,
});

const answerSchema = z.object({
  id: databaseUuidSchema,
  status: z.enum(["ready", "blocked"]),
  note: z.string().max(300).default(""),
  actorId: databaseUuidSchema,
});

export type AskPrinterCheckInput = z.input<typeof askSchema>;
export type AnswerPrinterCheckInput = z.input<typeof answerSchema>;

type Row = {
  id: string;
  asked_at: Date;
  asked_by_name: string;
  question: string;
  status: "pending" | "ready" | "blocked";
  answered_at: Date | null;
  answered_by_name: string | null;
  answer_note: string;
  closed_at: Date | null;
};

function toRecord(row: Row): PrinterCheckRecord {
  return {
    id: row.id,
    askedAt: row.asked_at.toISOString(),
    askedBy: row.asked_by_name,
    question: row.question,
    status: row.status,
    answeredAt: row.answered_at ? row.answered_at.toISOString() : null,
    answeredBy: row.answered_by_name,
    answerNote: row.answer_note,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
  };
}

const columns = `
  c.id, c.asked_at, c.question, c.status, c.answered_at, c.answer_note, c.closed_at,
  asker.display_name as asked_by_name,
  answerer.display_name as answered_by_name
`;

const from = `
  from printer_checks c
  join users asker on asker.id = c.asked_by
  left join users answerer on answerer.id = c.answered_by
`;

export async function listPrinterChecks(limit = 20) {
  const sql = database();
  const rows = await sql<Row[]>`
    select
      c.id, c.asked_at, c.question, c.status, c.answered_at, c.answer_note, c.closed_at,
      asker.display_name as asked_by_name,
      answerer.display_name as answered_by_name
    from printer_checks c
    join users asker on asker.id = c.asked_by
    left join users answerer on answerer.id = c.answered_by
    order by c.asked_at desc
    limit ${limit}
  `;
  return rows.map(toRecord);
}

export async function askPrinterCheck(rawInput: AskPrinterCheckInput) {
  const input = askSchema.parse(rawInput);
  await requirePermission(input.actorId, "print.fulfil");
  const sql = database();

  return sql.begin(async (transaction) => {
    // Staat er al een vraag open, dan die teruggeven in plaats van een tweede
    // stellen: de werkvloer hoort geen twee pop-ups te krijgen over dezelfde
    // printer.
    const [existing] = await transaction<Row[]>`
      select ${transaction.unsafe(columns)}
      ${transaction.unsafe(from)}
      where c.status = 'pending'
      limit 1
    `;
    if (existing) {
      return { check: toRecord(existing), alreadyOpen: true };
    }

    const [inserted] = await transaction<{ id: string }[]>`
      insert into printer_checks (asked_by, question)
      values (${input.actorId}, ${input.question.trim()})
      returning id
    `;
    const [row] = await transaction<Row[]>`
      select ${transaction.unsafe(columns)}
      ${transaction.unsafe(from)}
      where c.id = ${inserted.id}
    `;
    return { check: toRecord(row), alreadyOpen: false };
  });
}

export async function answerPrinterCheck(rawInput: AnswerPrinterCheckInput) {
  const input = answerSchema.parse(rawInput);
  await requirePermission(input.actorId, "conversion.execute");
  const note = validateAnswer(input.status, input.note);
  const sql = database();

  return sql.begin(async (transaction) => {
    const [current] = await transaction<{ status: string }[]>`
      select status from printer_checks where id = ${input.id} for update
    `;
    if (!current) {
      throw new PrinterCheckError("Deze vraag bestaat niet meer.");
    }
    // Twee mensen die tegelijk antwoorden: de tweede ziet het antwoord van de
    // eerste in plaats van het te overschrijven.
    if (current.status !== "pending") {
      const [row] = await transaction<Row[]>`
        select ${transaction.unsafe(columns)}
        ${transaction.unsafe(from)}
        where c.id = ${input.id}
      `;
      return { check: toRecord(row), alreadyAnswered: true };
    }

    await transaction`
      update printer_checks
      set status = ${input.status},
          answer_note = ${note},
          answered_at = now(),
          answered_by = ${input.actorId}
      where id = ${input.id}
    `;
    const [row] = await transaction<Row[]>`
      select ${transaction.unsafe(columns)}
      ${transaction.unsafe(from)}
      where c.id = ${input.id}
    `;
    return { check: toRecord(row), alreadyAnswered: false };
  });
}

/**
 * Noviply gaat printen: daarmee is deze vraag afgehandeld. Het antwoord vervalt,
 * zodat er niet ergens blijft staan dat de printer klaarstaat terwijl er
 * ondertussen materiaal doorheen is gegaan.
 */
export async function closePrinterCheck(id: string, actorId: string) {
  await requirePermission(actorId, "print.fulfil");
  const sql = database();
  const [row] = await sql<Row[]>`
    update printer_checks
    set closed_at = now(), closed_by = ${actorId}
    where id = ${id} and status <> 'pending' and closed_at is null
    returning id, asked_at, question, status, answered_at, answer_note, closed_at,
              '' as asked_by_name, null as answered_by_name
  `;
  if (!row) {
    throw new PrinterCheckError("Deze vraag is al afgehandeld of nog niet beantwoord.");
  }
  return { closed: true };
}
