import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { resolveRequestActorId } from "@/server/request-identity";
import {
  importPrintBatch,
  listPrintBatches,
  markBatchSeen,
  removePrintBatch,
  reopenBatchRow,
  settleBatchRow,
  settleWholeBatch,
} from "@/server/print-batch-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een ronde is een paar honderd regels; ruim genoeg, en niet onbeperkt. */
const maxUploadBytes = 4 * 1024 * 1024;

export async function GET() {
  try {
    return Response.json({ printBatches: await listPrintBatches() });
  } catch (error) {
    const response = apiErrorResponse(error, "GET /api/print-batches");
    return Response.json(response.body, { status: response.status });
  }
}

/** Het bestand van het ordersysteem inlezen. */
export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "VALIDATION", message: "Kies een bestand." },
        { status: 400 },
      );
    }
    if (file.size > maxUploadBytes) {
      return Response.json(
        { error: "VALIDATION", message: "Dit bestand is groter dan 4 MB." },
        { status: 413 },
      );
    }
    const opgegeven = Number(form.get("batchNumber"));
    const result = await importPrintBatch({
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      batchNumber: Number.isInteger(opgegeven) && opgegeven > 0 ? opgegeven : undefined,
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/print-batches");
    return Response.json(response.body, { status: response.status });
  }
}

/** Een regel afvinken, de hele ronde afvinken, of hem als gezien markeren. */
export async function PATCH(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const actorId = await resolveRequestActorId();

    if (body.action === "seen") {
      return Response.json(await markBatchSeen(String(body.batchId ?? ""), actorId));
    }
    if (body.action === "remove") {
      return Response.json(await removePrintBatch(String(body.batchId ?? ""), actorId));
    }
    if (body.action === "settleBatch") {
      return Response.json(await settleWholeBatch(String(body.batchId ?? ""), actorId));
    }
    // Een verkeerde klik terugdraaien: de regel staat weer open.
    if (body.action === "reopenRow") {
      return Response.json(await reopenBatchRow({ rowId: body.rowId, actorId }));
    }
    return Response.json(await settleBatchRow({
      rowId: body.rowId,
      status: body.status,
      note: body.note ?? "",
      actorId,
    }));
  } catch (error) {
    const response = apiErrorResponse(error, "PATCH /api/print-batches");
    return Response.json(response.body, { status: response.status });
  }
}
