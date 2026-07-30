import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { recordError } from "@/server/error-log-service";
import { resolveError } from "@/server/error-log-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een scherm dat omvalt meldt zichzelf. Anders hoor je het pas als iemand belt
 * dat "het niet meer werkt", en dan is er niets meer terug te vinden.
 *
 * Bewust zonder rechtencontrole: ook de werkvloer, die zonder aanmelden binnen
 * komt, moet kunnen melden dat hun scherm stukging. De schrijfrem eronder houdt
 * tegen dat een lus in een scherm de tabel volschrijft.
 */
export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    await recordError({
      source: "browser",
      origin: typeof body.origin === "string" ? body.origin : "",
      message: body.message,
      detail: body.detail,
      role: typeof body.role === "string" ? body.role : "",
    });
    return Response.json({ recorded: true }, { status: 202 });
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/errors");
    return Response.json(response.body, { status: response.status });
  }
}

/** Afgehandeld door management. */
export async function PATCH(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    return Response.json(
      await resolveError(String(body.id ?? ""), await resolveRequestActorId()),
    );
  } catch (error) {
    const response = apiErrorResponse(error, "PATCH /api/errors");
    return Response.json(response.body, { status: response.status });
  }
}
