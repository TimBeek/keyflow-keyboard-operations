import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { askPrinterCheck, listPrinterChecks } from "@/server/printer-check-service";
import { resolveRequestActorId } from "@/server/request-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ printerChecks: await listPrinterChecks() });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const body = await request.json().catch(() => ({}));
    const result = await askPrinterCheck({
      question: typeof body.question === "string" ? body.question : "",
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result, { status: result.alreadyOpen ? 200 : 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
