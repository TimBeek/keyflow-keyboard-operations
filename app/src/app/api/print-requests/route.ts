import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import {
  createPrintRequestRecord,
  listPrintRequests,
} from "@/server/print-request-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actorId = await resolveRequestActorId(
      new URL(request.url).searchParams.get("actorId"),
    );
    return Response.json({ printRequests: await listPrintRequests(actorId) });
  } catch (error) {
    const response = apiErrorResponse(error, "GET /api/print-requests");
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await createPrintRequestRecord({
      ...body,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/print-requests");
    return Response.json(response.body, { status: response.status });
  }
}
