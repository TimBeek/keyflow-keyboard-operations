import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { answerPrinterCheck, closePrinterCheck } from "@/server/printer-check-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await answerPrinterCheck({
      id: (await params).id,
      status: body.status,
      note: typeof body.note === "string" ? body.note : "",
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

/** Noviply is gaan printen: de vraag is daarmee afgehandeld. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkWriteLimit(request);
    return Response.json(await closePrinterCheck(
      (await params).id,
      await resolveRequestActorId(),
    ));
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
