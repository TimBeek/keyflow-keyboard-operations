import { DatabaseConfigurationError } from "@/server/database";
import {
  getInventoryImportReview,
  inventoryImportErrorResponse,
} from "@/server/inventory-import-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const { batchId } = await context.params;
    return Response.json(await getInventoryImportReview(batchId));
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
