import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { resolveRequestActorId } from "@/server/request-identity";
import {
  listNoviplyUnavailable,
  removeNoviplyUnavailable,
} from "@/server/noviply-availability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wat Noviply op dit moment niet kan printen. */
export async function GET() {
  try {
    return Response.json({ noviplyUnavailable: await listNoviplyUnavailable() });
  } catch (error) {
    const response = apiErrorResponse(error, "GET /api/noviply-unavailable");
    return Response.json(response.body, { status: response.status });
  }
}

/** Ze hebben het model alsnog: de regel gaat eraf en het advies mag weer. */
export async function DELETE(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await removeNoviplyUnavailable({
      id: typeof body.id === "string" ? body.id : "",
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "DELETE /api/noviply-unavailable");
    return Response.json(response.body, { status: response.status });
  }
}
