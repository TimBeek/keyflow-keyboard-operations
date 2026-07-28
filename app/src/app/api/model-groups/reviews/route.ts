import { DatabaseConfigurationError } from "../../../../server/database";
import {
  modelGroupReviewErrorResponse,
  reviewModelGroup,
} from "../../../../server/model-group-review-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await reviewModelGroup(await request.json());
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return Response.json(
        { error: "DATABASE_NOT_CONFIGURED", message: error.message },
        { status: 503 },
      );
    }

    const response = modelGroupReviewErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
