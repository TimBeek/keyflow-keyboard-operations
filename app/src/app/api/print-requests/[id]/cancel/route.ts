import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { resolveRequestActorId } from "@/server/request-identity";
import { cancelPrintRequestRecord } from "@/server/print-request-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een verkeerd ingevoerde aanvraag terugtrekken.
 *
 * Apart van het afvinken: dat doet Noviply en vraagt om andere rechten. Dit
 * doet de werkvloer zelf, zodra ze de vergissing zien — wachten betekent dat er
 * een vel geprint wordt dat nergens op past.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkWriteLimit(request);
    const { id } = await params;
    const result = await cancelPrintRequestRecord({
      id,
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/print-requests/[id]/cancel");
    return Response.json(response.body, { status: response.status });
  }
}
