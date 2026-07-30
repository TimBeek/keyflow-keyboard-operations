import { cookies } from "next/headers";
import { apiErrorResponse } from "@/server/api-errors";
import { checkWriteLimit } from "@/server/rate-limit";
import {
  ACCESS_COOKIE,
  changeOwnPin,
  createAccessToken,
  resolveSignedClaim,
} from "@/server/access-session";

export const runtime = "nodejs";

/**
 * Je eigen pincode wijzigen. Alleen voor wie is aangemeld — en juist ook voor
 * wie nog op een tijdelijke code zit, want dat is precies wat hier gebeurt.
 */
export async function POST(request: Request) {
  try {
    checkWriteLimit(request);
    const claim = await resolveSignedClaim();
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
    // De code is nu eigen; het bewijs mag de halve sessie kwijt, anders zou de
    // gebruiker meteen na het kiezen nog steeds nergens bij kunnen.
    const jar = await cookies();
    jar.set(ACCESS_COOKIE, createAccessToken(claim.userId, claim.role, Math.floor(Date.now() / 1000)), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return Response.json({ ok: true, role: claim.role, userId: claim.userId });
  } catch (error) {
    const response = apiErrorResponse(error, "POST /api/access/pin");
    return Response.json(response.body, { status: response.status });
  }
}
