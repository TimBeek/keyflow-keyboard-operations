import { z } from "zod";
import type { UserRole } from "./access-control";

export const identityModes = ["pilot", "entra"] as const;
export type IdentityMode = (typeof identityModes)[number];

export const entraAppRoles: Record<UserRole, string> = {
  employee: "KeyFlow.Employee",
  management: "KeyFlow.Management",
};

export type KeyFlowIdentity = {
  externalId: string;
  tenantId: string;
  objectId: string;
  displayName: string;
  email: string;
  role: UserRole;
  mode: IdentityMode;
};

export type ConfigurationCheck = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

export type ProductionConfigurationReport = {
  mode: IdentityMode;
  ready: boolean;
  checks: ConfigurationCheck[];
};

const entraProfileSchema = z.object({
  oid: z.string().uuid(),
  tid: z.string().uuid(),
  sub: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  preferred_username: z.string().email().optional(),
  email: z.string().email().optional(),
  roles: z.array(z.string()).default([]),
}).passthrough();

const entraIssuerPattern = /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0\/?$/i;
const postgresPattern = /^postgres(?:ql)?:\/\//i;
const httpsPattern = /^https:\/\//i;

export function identityModeFromEnvironment(
  environment: Record<string, string | undefined>,
): IdentityMode {
  return environment.KEYFLOW_AUTH_MODE === "entra" ? "entra" : "pilot";
}

export function roleFromEntraAppRoles(rawRoles: unknown): UserRole {
  const roles = z.array(z.string()).safeParse(rawRoles);
  if (!roles.success) {
    throw new IdentityClaimsError(
      "INVALID_ROLES_CLAIM",
      "De Microsoft-login bevat geen geldige lijst met KeyFlow-app-rollen.",
    );
  }
  if (roles.data.includes(entraAppRoles.management)) return "management";
  if (roles.data.includes(entraAppRoles.employee)) return "employee";
  throw new IdentityClaimsError(
    "ROLE_NOT_ASSIGNED",
    "Je Microsoft-account heeft nog geen KeyFlow.Employee- of KeyFlow.Management-rol.",
  );
}

export function parseEntraIdentity(profile: unknown): KeyFlowIdentity {
  const parsed = entraProfileSchema.safeParse(profile);
  if (!parsed.success) {
    throw new IdentityClaimsError(
      "INVALID_IDENTITY_CLAIMS",
      "De Microsoft-login mist een geldig tenant-, object- of e-mailadres.",
    );
  }
  const email = parsed.data.email ?? parsed.data.preferred_username;
  if (!email) {
    throw new IdentityClaimsError(
      "EMAIL_NOT_AVAILABLE",
      "De Microsoft-login bevat geen bruikbaar e-mailadres.",
    );
  }
  return {
    externalId: `${parsed.data.tid}:${parsed.data.oid}`,
    tenantId: parsed.data.tid,
    objectId: parsed.data.oid,
    displayName: parsed.data.name ?? email,
    email: email.toLowerCase(),
    role: roleFromEntraAppRoles(parsed.data.roles),
    mode: "entra",
  };
}

export function productionConfigurationReport(
  environment: Record<string, string | undefined>,
): ProductionConfigurationReport {
  const mode = identityModeFromEnvironment(environment);
  const issuerMatch = environment.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.match(entraIssuerPattern);
  const checks: ConfigurationCheck[] = [
    {
      key: "database",
      label: "Gedeelde PostgreSQL-database",
      ready: postgresPattern.test(environment.DATABASE_URL ?? ""),
      detail: environment.DATABASE_URL
        ? "DATABASE_URL gebruikt een PostgreSQL-verbinding."
        : "DATABASE_URL ontbreekt.",
    },
    {
      key: "auth_mode",
      label: "Persoonlijke Microsoft-login",
      ready: mode === "entra",
      detail: mode === "entra"
        ? "Entra-login is ingeschakeld."
        : "De veilige pilotmodus is actief.",
    },
    {
      key: "auth_secret",
      label: "Versleutelde sessies",
      ready: (environment.AUTH_SECRET?.length ?? 0) >= 32,
      detail: (environment.AUTH_SECRET?.length ?? 0) >= 32
        ? "AUTH_SECRET is aanwezig en lang genoeg."
        : "AUTH_SECRET ontbreekt of is korter dan 32 tekens.",
    },
    {
      key: "entra_client",
      label: "Entra-appregistratie",
      ready: z.string().uuid().safeParse(environment.AUTH_MICROSOFT_ENTRA_ID_ID).success,
      detail: environment.AUTH_MICROSOFT_ENTRA_ID_ID
        ? "De client-id heeft een geldig UUID-formaat."
        : "AUTH_MICROSOFT_ENTRA_ID_ID ontbreekt.",
    },
    {
      key: "entra_secret",
      label: "Entra-clientsecret",
      ready: (environment.AUTH_MICROSOFT_ENTRA_ID_SECRET?.length ?? 0) >= 16,
      detail: (environment.AUTH_MICROSOFT_ENTRA_ID_SECRET?.length ?? 0) >= 16
        ? "De clientsecret is aanwezig."
        : "AUTH_MICROSOFT_ENTRA_ID_SECRET ontbreekt of is te kort.",
    },
    {
      key: "entra_issuer",
      label: "Entra-tenantbegrenzing",
      ready: Boolean(issuerMatch && issuerMatch[1] !== "00000000-0000-0000-0000-000000000000"),
      detail: issuerMatch
        ? "De issuer is tenantgebonden en gebruikt het v2.0-protocol."
        : "Gebruik https://login.microsoftonline.com/<tenant-id>/v2.0.",
    },
    {
      key: "trust_host",
      label: "Beveiligde reverse-proxyheaders",
      ready: environment.AUTH_TRUST_HOST === "true",
      detail: environment.AUTH_TRUST_HOST === "true"
        ? "AUTH_TRUST_HOST is expliciet ingeschakeld."
        : "AUTH_TRUST_HOST moet op true staan in de productiehosting.",
    },
    {
      key: "base_url",
      label: "HTTPS-productieadres",
      ready: httpsPattern.test(environment.KEYFLOW_BASE_URL ?? ""),
      detail: httpsPattern.test(environment.KEYFLOW_BASE_URL ?? "")
        ? "Het productieadres gebruikt HTTPS."
        : "KEYFLOW_BASE_URL ontbreekt of gebruikt geen HTTPS.",
    },
  ];

  return {
    mode,
    ready: checks.every((check) => check.ready),
    checks,
  };
}

export class IdentityClaimsError extends Error {
  constructor(
    public readonly code:
      | "INVALID_ROLES_CLAIM"
      | "ROLE_NOT_ASSIGNED"
      | "INVALID_IDENTITY_CLAIMS"
      | "EMAIL_NOT_AVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "IdentityClaimsError";
  }
}
