import "server-only";
import { identityModeFromEnvironment } from "@/domain/identity";
import { resolvePilotActorId } from "./access-session";

/**
 * De aanroepers geven nog een actorId mee uit de tijd dat de browser dat mocht
 * bepalen. Dat wordt bewust genegeerd; de handtekening blijft staan zodat elke
 * route niet hoeft te veranderen.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveRequestActorId(...ignored: unknown[]) {
  if (identityModeFromEnvironment(process.env) === "pilot") {
    // Wat de browser meestuurt telt niet meer. Zonder geldig toegangsbewijs is
    // iedereen werkvloer, en die mag niets van management of Noviply — anders
    // waren de rechten alleen een gordijn.
    return resolvePilotActorId();
  }

  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) {
    throw new RequestIdentityError(
      "AUTHENTICATION_REQUIRED",
      "Meld je persoonlijk aan voordat je deze handeling uitvoert.",
      401,
    );
  }
  return session.user.id;
}

export class RequestIdentityError extends Error {
  constructor(
    public readonly code: "ACTOR_REQUIRED" | "AUTHENTICATION_REQUIRED",
    message: string,
    public readonly status: 400 | 401,
  ) {
    super(message);
    this.name = "RequestIdentityError";
  }
}

export function requestIdentityErrorResponse(error: unknown) {
  if (error instanceof RequestIdentityError) {
    return {
      status: error.status,
      body: {
        error: error.code,
        message: error.message,
      },
    };
  }
  throw error;
}
