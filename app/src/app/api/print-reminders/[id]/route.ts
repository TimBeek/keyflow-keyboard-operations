import { apiErrorResponse } from "@/server/api-errors";
import { resolveRequestActorId } from "@/server/request-identity";
import { acknowledgePrintReminder } from "@/server/print-reminder-service";

export const runtime = "nodejs";

/** Noviply heeft de melding gezien. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(await acknowledgePrintReminder(
      (await params).id,
      await resolveRequestActorId(),
    ));
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
