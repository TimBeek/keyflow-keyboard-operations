import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import { changeOwnPin, resolvePilotClaim } from "@/server/access-session";

export const runtime = "nodejs";

/** Je eigen pincode wijzigen. Alleen voor wie is aangemeld. */
export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const claim = await resolvePilotClaim();
    if (claim.role === "employee") {
      return Response.json(
        { error: "FORBIDDEN", message: "Meld je eerst aan." },
        { status: 403 },
      );
    }
    const body = await request.json();
    await changeOwnPin(
      claim.userId,
      typeof body.currentPin === "string" ? body.currentPin : "",
      typeof body.newPin === "string" ? body.newPin : "",
    );
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
