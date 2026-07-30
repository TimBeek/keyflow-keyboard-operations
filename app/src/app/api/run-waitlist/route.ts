import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { resolveRequestActorId } from "@/server/request-identity";
import {
  addToRunWaitlist,
  listRunWaitlist,
  settleRunWaitlistEntry,
} from "@/server/run-waitlist-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** De laptops die apart staan tot de volgende printronde. */
export async function GET() {
  try {
    return Response.json({ runWaitlist: await listRunWaitlist() });
  } catch (error) {
    const response = apiErrorResponse(error, "GET /api/run-waitlist");
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await addToRunWaitlist({
      ...body,
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/run-waitlist");
    return Response.json(response.body, { status: response.status });
  }
}

/** Na de ronde: lag hij er wel of niet. */
export async function PATCH(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json();
    const result = await settleRunWaitlistEntry({
      ...body,
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "PATCH /api/run-waitlist");
    return Response.json(response.body, { status: response.status });
  }
}
