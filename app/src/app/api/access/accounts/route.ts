import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import {
  createPilotAccount,
  deactivateAccount,
  listPilotAccounts,
  resetAccountPin,
  resolvePilotClaim,
} from "@/server/access-session";
import type { UserRole } from "@/domain/access-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ accounts: await listPilotAccounts() });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const { userId } = await resolvePilotClaim();
    const body = await request.json();
    const account = await createPilotAccount(
      typeof body.name === "string" ? body.name : "",
      body.role as UserRole,
      userId,
    );
    return Response.json(account, { status: 201 });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

/** Pincode opnieuw instellen wanneer iemand hem kwijt is. */
export async function PATCH(request: Request) {
  try {
    checkWriteLimit(request);
    const { userId } = await resolvePilotClaim();
    const body = await request.json();
    return Response.json(await resetAccountPin(String(body.userId ?? ""), userId));
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    checkWriteLimit(request);
    const { userId } = await resolvePilotClaim();
    const body = await request.json();
    await deactivateAccount(String(body.userId ?? ""), userId);
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
