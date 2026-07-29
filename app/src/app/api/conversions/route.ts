import { apiErrorResponse } from "@/server/api-errors";
import { listConversionLog, logConversion } from "@/server/conversion-log-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actorId = await resolveRequestActorId(
      new URL(request.url).searchParams.get("actorId"),
    );
    return Response.json({ conversionLog: await listConversionLog(actorId) });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await logConversion({
      ...body,
      actorId: await resolveRequestActorId(body.actorId),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
