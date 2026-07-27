import "server-only";
import { database } from "@/server/database";
import type { Permission } from "@/domain/access-control";

export async function requirePermission(actorId: string, permission: Permission) {
  const sql = database();
  const [granted] = await sql<{ granted: boolean }[]>`
    select true as granted
    from users actor
    inner join user_roles user_role on user_role.user_id = actor.id
    inner join role_permissions role_permission
      on role_permission.role_code = user_role.role_code
    where actor.id = ${actorId}::uuid
      and actor.active = true
      and role_permission.permission_code = ${permission}
    limit 1
  `;

  if (!granted) {
    throw new AuthorizationError(
      "PERMISSION_DENIED",
      "Je account heeft geen toestemming voor deze handeling.",
    );
  }
}

export class AuthorizationError extends Error {
  constructor(
    public readonly code: "PERMISSION_DENIED",
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function authorizationErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return { status: 403, body: { error: error.code, message: error.message } };
  }
  throw error;
}
