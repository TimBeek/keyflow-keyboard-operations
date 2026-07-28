import { DatabaseConfigurationError } from "@/server/database";
import {
  inventoryErrorResponse,
  recordInventoryMutation,
} from "@/server/inventory-service";
import {
  RequestIdentityError,
  requestIdentityErrorResponse,
  resolveRequestActorId,
} from "@/server/request-identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await recordInventoryMutation({
      ...body,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof RequestIdentityError) {
      const response = requestIdentityErrorResponse(error);
      return Response.json(response.body, { status: response.status });
    }
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "DATABASE_NOT_CONFIGURED", message: error.message },
        { status: 503 },
      );
    }

    const response = inventoryErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
