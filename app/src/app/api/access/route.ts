import { cookies } from "next/headers";
import { apiErrorResponse } from "@/server/api-errors";
import {
  ACCESS_COOKIE,
  createAccessToken,
  listPilotAccounts,
  openRole,
  resolvePilotClaim,
  signInWithPin,
} from "@/server/access-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wie er nu binnen is, en wie er kan aanmelden. */
export async function GET() {
  try {
    const [claim, accounts] = await Promise.all([resolvePilotClaim(), listPilotAccounts()]);
    return Response.json({ ...claim, openRole, accounts });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    if (!userId || !/^\d{4}$/.test(pin.trim())) {
      return Response.json(
        { error: "ACCESS_DENIED", message: "Vul je naam en een pincode van vier cijfers in." },
        { status: 401 },
      );
    }

    const result = await signInWithPin(userId, pin);
    if (!result.ok) {
      return Response.json({ error: "ACCESS_DENIED", message: result.message }, { status: 401 });
    }

    const jar = await cookies();
    jar.set(ACCESS_COOKIE, createAccessToken(result.userId, result.role, Math.floor(Date.now() / 1000)), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return Response.json({
      userId: result.userId,
      role: result.role,
      name: result.name,
      mustChangePin: result.mustChangePin,
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  return Response.json({ role: openRole });
}
