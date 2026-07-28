import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/domain/access-control";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      externalId: string;
      tenantId: string;
      role: UserRole;
    } & DefaultSession["user"];
  }

  interface Profile {
    oid?: string;
    tid?: string;
    roles?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    keyflow?: {
      databaseUserId: string;
      externalId: string;
      tenantId: string;
      role: UserRole;
    };
  }
}
