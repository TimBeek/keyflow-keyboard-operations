import "server-only";
import type { ReKeyIdentity } from "@/domain/identity";
import { database } from "./database";

export type SynchronizedIdentity = ReKeyIdentity & {
  databaseUserId: string;
};

export async function synchronizeEntraIdentity(
  identity: ReKeyIdentity,
): Promise<SynchronizedIdentity> {
  const sql = database();

  return sql.begin(async (transaction) => {
    const [user] = await transaction<{
      id: string;
      active: boolean;
    }[]>`
      insert into users (
        external_id,
        display_name,
        email
      )
      values (
        ${identity.externalId},
        ${identity.displayName},
        ${identity.email}
      )
      on conflict (external_id) do update set
        display_name = excluded.display_name,
        email = excluded.email
      returning id, active
    `;

    if (!user?.active) {
      throw new IdentitySynchronizationError(
        "ACCOUNT_DISABLED",
        "Je ReKey-account is door management gedeactiveerd.",
      );
    }

    await transaction`
      delete from user_roles
      where user_id = ${user.id}::uuid
        and role_code in ('employee', 'management')
        and role_code <> ${identity.role}
    `;
    await transaction`
      insert into user_roles (
        user_id,
        role_code
      )
      values (
        ${user.id}::uuid,
        ${identity.role}
      )
      on conflict (user_id, role_code) do nothing
    `;

    return {
      ...identity,
      databaseUserId: user.id,
    };
  });
}

export class IdentitySynchronizationError extends Error {
  constructor(
    public readonly code: "ACCOUNT_DISABLED",
    message: string,
  ) {
    super(message);
    this.name = "IdentitySynchronizationError";
  }
}
