import { apiErrorResponse } from "@/server/api-errors";
import { settlePrintRequestRecord } from "@/server/print-request-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await request.json();
    const result = await settlePrintRequestRecord({
      ...body,
      id: (await params).id,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
