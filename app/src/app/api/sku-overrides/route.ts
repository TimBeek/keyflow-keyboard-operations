import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { resolveRequestActorId } from "@/server/request-identity";
import { setSkuOverride } from "@/server/sku-override-service";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await setSkuOverride({
      ...body,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
