import { DatabaseConfigurationError } from "@/server/database";
import {
  operationsReadiness,
  operationsReadinessErrorResponse,
} from "@/server/operations-readiness-service";
import {
  RequestIdentityError,
  requestIdentityErrorResponse,
  resolveRequestActorId,
} from "@/server/request-identity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actorId = await resolveRequestActorId(
      new URL(request.url).searchParams.get("actorId"),
      process.env.KEYFLOW_IMPORT_ACTOR_ID,
    );
    const report = await operationsReadiness(actorId);
    return Response.json(report);
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
    const response = operationsReadinessErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
