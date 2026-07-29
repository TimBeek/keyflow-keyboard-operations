import { checkWriteLimit, RateLimitError } from "@/server/rate-limit";
import { DatabaseConfigurationError } from "@/server/database";
import { goLiveAcceptanceSummary } from "@/domain/go-live-acceptance";
import {
  goLiveAcceptanceErrorResponse,
  listGoLiveAcceptanceRecords,
  recordGoLiveAcceptance,
} from "@/server/go-live-acceptance-service";
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
    const records = await listGoLiveAcceptanceRecords(actorId);
    return Response.json({
      records,
      summary: goLiveAcceptanceSummary(records),
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "TOO_MANY_REQUESTS", message: error.message },
        { status: 429 },
      );
    }
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await recordGoLiveAcceptance({
      ...body,
      actorId: await resolveRequestActorId(
        body.actorId,
        process.env.KEYFLOW_IMPORT_ACTOR_ID,
      ),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "TOO_MANY_REQUESTS", message: error.message },
        { status: 429 },
      );
    }
    return routeErrorResponse(error);
  }
}

function routeErrorResponse(error: unknown) {
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
  const response = goLiveAcceptanceErrorResponse(error);
  return Response.json(response.body, { status: response.status });
}
