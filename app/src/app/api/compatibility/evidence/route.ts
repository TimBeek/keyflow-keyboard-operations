import { checkWriteLimit, RateLimitError } from "@/server/rate-limit";
import { DatabaseConfigurationError } from "../../../../server/database";
import {
  compatibilityEvidenceErrorResponse,
  recordCompatibilityEvidence,
  withdrawCompatibilityRejection,
} from "../../../../server/compatibility-evidence-service";
import {
  RequestIdentityError,
  requestIdentityErrorResponse,
  resolveRequestActorId,
} from "../../../../server/request-identity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await recordCompatibilityEvidence({
      ...body,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "TOO_MANY_REQUESTS", message: error.message },
        { status: 429 },
      );
    }
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
    const response = compatibilityEvidenceErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

/**
 * Een afkeuring intrekken. De melding van de werkvloer blijft staan; alleen de
 * gevolgtrekking eruit — dat deze hangmap niet meer geadviseerd wordt — gaat weg.
 */
export async function DELETE(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await withdrawCompatibilityRejection({
      catalogKey: String(body.catalogKey ?? ""),
      model: String(body.model ?? ""),
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "TOO_MANY_REQUESTS", message: error.message },
        { status: 429 },
      );
    }
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
    const response = compatibilityEvidenceErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
