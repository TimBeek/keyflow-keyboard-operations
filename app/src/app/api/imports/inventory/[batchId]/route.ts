import { DatabaseConfigurationError } from "@/server/database";
import {
  getInventoryImportReview,
  inventoryImportErrorResponse,
} from "@/server/inventory-import-service";
import {
  RequestIdentityError,
  requestIdentityErrorResponse,
  resolveRequestActorId,
} from "@/server/request-identity";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await context.params;
    const actorId = await resolveRequestActorId(
      new URL(request.url).searchParams.get("actorId"),
      process.env.KEYFLOW_IMPORT_ACTOR_ID,
    );
    if (!actorId) {
      return Response.json(
        {
          error: "OPERATOR_NOT_CONFIGURED",
          message: "Configureer KEYFLOW_IMPORT_ACTOR_ID voordat imports worden bekeken.",
        },
        { status: 503 },
      );
    }
    return Response.json(await getInventoryImportReview(batchId, actorId));
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

    const response = inventoryImportErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
