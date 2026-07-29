import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import {
  OperationsPolicyConflictError,
  updateOperationsPolicy,
} from "@/server/operations-policy-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await updateOperationsPolicy({
      ...body,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result);
  } catch (error) {
    // Geen fout maar een botsing: de beheerder moet zien wat er nu staat.
    if (error instanceof OperationsPolicyConflictError) {
      return Response.json(
        {
          error: "POLICY_CONFLICT",
          message: error.message,
          policy: error.current,
          version: error.version,
        },
        { status: 409 },
      );
    }
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
