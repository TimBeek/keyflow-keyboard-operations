import { apiErrorResponse } from "@/server/api-errors";
import { resolveRequestActorId } from "@/server/request-identity";
import {
  listVerificationReports,
  recordVerificationReport,
} from "@/server/verification-report-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ verificationReports: await listVerificationReports() });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await recordVerificationReport({
      ...body,
      actorId: await resolveRequestActorId(),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
