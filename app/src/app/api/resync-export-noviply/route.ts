import { apiErrorResponse } from "@/server/api-errors";
import { checkIntegrationToken } from "@/server/integration-token";
import { checkWriteLimit } from "@/server/rate-limit";
import {
  normalizeResyncPayload,
  resyncFingerprint,
  resyncPayloadSchema,
  rowsForBatch,
  rowsToResync,
  unknownLanguageCodes,
} from "@/domain/resync-export";
import { importResyncBatch, listPrintBatches } from "@/server/print-batch-service";
import { activeBatches } from "@/domain/print-batch";

/**
 * De koppeling met het ordersysteem.
 *
 * POST levert een printronde aan; die komt bij Noviply onder "Print runs" te
 * staan, precies zoals een geüpload bestand dat doet. GET geeft dezelfde lijst
 * terug, zodat de andere kant kan nakijken of het aangekomen is.
 *
 * De naam is die van de aanroeper: voor hén is het een export naar Noviply.
 * Voor ons is het een levering, en zo staat hij ook in de rondelijst.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De koppeling handelt onder een eigen naam, niet onder die van een collega. */
const ordersysteemActor = "00000000-0000-0000-0000-000000000004";

/** Vandaag in Nederland — de server kan ergens anders staan. */
function vandaagInNederland() {
  const delen = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return delen;
}

function weiger(uitkomst: { status: number; code: string; message: string }) {
  return Response.json(
    { error: uitkomst.code, message: uitkomst.message },
    { status: uitkomst.status },
  );
}

export async function POST(request: Request) {
  try {
    const toegang = checkIntegrationToken(request);
    if (!toegang.ok) return weiger(toegang);
    checkWriteLimit(request);

    const body = await request.json().catch(() => null);
    if (body === null) {
      return Response.json(
        { error: "VALIDATION", message: "De inhoud is geen geldige JSON." },
        { status: 400 },
      );
    }

    const gelezen = resyncPayloadSchema.safeParse(body);
    if (!gelezen.success) {
      // Wél zeggen wát er mis is: aan de andere kant zit een programmeur die
      // dit moet kunnen oplossen zonder hier te hoeven vragen.
      return Response.json(
        {
          error: "VALIDATION",
          message: "Deze regels kloppen niet. Verwacht: model, language, layout, quantity, ordernummer.",
          issues: gelezen.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const verzoek = normalizeResyncPayload(gelezen.data);
    const runDate = verzoek.runDate ?? vandaagInNederland();
    const resultaat = await importResyncBatch({
      runDate,
      batchNumber: verzoek.batchNumber,
      source: verzoek.source?.trim() || "Ordersysteem",
      fingerprint: resyncFingerprint(verzoek.rows),
      rows: rowsForBatch(verzoek.rows),
      actorId: ordersysteemActor,
    });

    const onbekend = unknownLanguageCodes(verzoek.rows);
    return Response.json(
      {
        batchId: resultaat.batchId,
        runDate: resultaat.runDate,
        batchNumber: resultaat.batchNumber,
        rows: resultaat.rows,
        /** True betekent: deze ronde stond er al, er is niets bijgemaakt. */
        duplicate: resultaat.duplicate,
        sameContent: resultaat.sameFile,
        /**
         * Landcodes die we niet kennen. De regels staan er wél in — ze worden
         * niet geweigerd — maar zonder taal erbij, zodat iemand ernaar kijkt.
         */
        unknownLanguageCodes: onbekend,
      },
      { status: resultaat.duplicate ? 200 : 201 },
    );
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/resync-export-noviply");
    return Response.json(response.body, { status: response.status });
  }
}

/**
 * Teruglezen wat er openstaat, in dezelfde vorm als waarin het is aangeleverd.
 *
 * Handig aan de andere kant om te zien of een levering is aangekomen, en om te
 * weten wat er nog niet geprint is zonder dat iemand het hoeft na te vragen.
 */
export async function GET(request: Request) {
  try {
    const toegang = checkIntegrationToken(request);
    if (!toegang.ok) return weiger(toegang);

    const url = new URL(request.url);
    const alles = url.searchParams.get("scope") === "all";
    const batches = await listPrintBatches();
    const gekozen = alles ? batches.filter((b) => b.deletedAt === null) : activeBatches(batches);

    return Response.json({
      batches: gekozen.map((batch) => ({
        batchId: batch.id,
        runDate: batch.runDate,
        batchNumber: batch.batchNumber,
        source: batch.fileName,
        uploadedAt: batch.uploadedAt,
        seenAt: batch.seenAt,
        rows: batch.rows.map((row, index) => ({
          ...rowsToResync([row])[0],
          status: row.status,
          note: row.note,
          handledAt: row.handledAt,
          lineNumber: row.lineNumber || index + 1,
        })),
      })),
    });
  } catch (error) {
    const response = apiErrorResponse(error, "GET /api/resync-export-noviply");
    return Response.json(response.body, { status: response.status });
  }
}
