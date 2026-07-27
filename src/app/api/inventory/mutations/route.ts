import { DatabaseConfigurationError } from "@/server/database";
import {
  inventoryErrorResponse,
  recordInventoryMutation,
} from "@/server/inventory-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await recordInventoryMutation(await request.json());
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
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
