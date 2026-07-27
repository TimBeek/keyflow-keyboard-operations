import { DatabaseConfigurationError } from "@/server/database";
import {
  inventoryImportErrorResponse,
  resolveInventoryImportIssue,
} from "@/server/inventory-import-service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ batchId: string; issueId: string }> },
) {
  try {
    const { batchId, issueId } = await context.params;
    const body = await request.json();
    const actorId = typeof body.actorId === "string" && body.actorId
      ? body.actorId
      : process.env.KEYFLOW_IMPORT_ACTOR_ID;
    if (!actorId) {
      return Response.json(
        {
          error: "OPERATOR_NOT_CONFIGURED",
          message: "Configureer KEYFLOW_IMPORT_ACTOR_ID voordat bevindingen worden afgehandeld.",
        },
        { status: 503 },
      );
    }

    const result = await resolveInventoryImportIssue({
      batchId,
      issueId,
      actorId,
      resolved: body.resolved,
      resolutionNote: body.resolutionNote,
      resolutionAction: body.resolutionAction,
      correctedValue: body.correctedValue,
    });
    return Response.json(result);
  } catch (error) {
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
