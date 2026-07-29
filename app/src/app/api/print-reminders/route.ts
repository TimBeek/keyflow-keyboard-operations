import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { resolveRequestActorId } from "@/server/request-identity";
import { listPrintReminders, sendPrintReminder } from "@/server/print-reminder-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ printReminders: await listPrintReminders() });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const result = await sendPrintReminder(await resolveRequestActorId());
    return Response.json(result, { status: result.alreadySent ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
