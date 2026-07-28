import "server-only";
import { identityModeFromEnvironment } from "@/domain/identity";

export async function resolveRequestActorId(
  suppliedActorId: unknown,
  pilotFallback?: string,
) {
  if (identityModeFromEnvironment(process.env) === "pilot") {
    const actorId = typeof suppliedActorId === "string" && suppliedActorId
      ? suppliedActorId
      : pilotFallback;
    if (!actorId) {
      throw new RequestIdentityError(
        "ACTOR_REQUIRED",
        "Een actorId is verplicht in de pilotmodus.",
        400,
      );
    }
    return actorId;
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
