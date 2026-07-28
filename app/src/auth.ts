import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import {
  identityModeFromEnvironment,
  parseEntraIdentity,
} from "@/domain/identity";
import type { UserRole } from "@/domain/access-control";
import { synchronizeEntraIdentity } from "@/server/identity-service";

const identityMode = identityModeFromEnvironment(process.env);
const entraEnabled = identityMode === "entra";
const pilotBuildSecret = "keyflow-pilot-auth-disabled-build-secret";
type KeyFlowTokenIdentity = {
  databaseUserId: string;
  externalId: string;
  tenantId: string;
  role: UserRole;
};

const entraProvider = MicrosoftEntraID({
  clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
  clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
  profile(profile) {
    const identity = parseEntraIdentity(profile);
    return {
      id: profile.sub,
      name: identity.displayName,
      email: identity.email,
      image: null,
      oid: identity.objectId,
      tid: identity.tenantId,
      roles: profile.roles,
    };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: entraEnabled ? process.env.AUTH_SECRET : pilotBuildSecret,
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: entraEnabled ? [entraProvider] : [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    signIn({ profile }) {
      if (!entraEnabled || !profile) return false;
      parseEntraIdentity(profile);
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "microsoft-entra-id" && profile) {
        const synchronized = await synchronizeEntraIdentity(
          parseEntraIdentity(profile),
        );
        token.keyflow = {
          databaseUserId: synchronized.databaseUserId,
          externalId: synchronized.externalId,
          role: synchronized.role,
          tenantId: synchronized.tenantId,
        };
      }
      return token;
    },
    session({ session, token }) {
      const keyflow = token.keyflow as KeyFlowTokenIdentity | undefined;
      if (session.user && keyflow) {
        session.user.id = keyflow.databaseUserId;
        session.user.externalId = keyflow.externalId;
        session.user.role = keyflow.role;
        session.user.tenantId = keyflow.tenantId;
      }
      return session;
    },
  },
});
