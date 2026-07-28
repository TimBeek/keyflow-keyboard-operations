import { describe, expect, it } from "vitest";
import {
  IdentityClaimsError,
  entraAppRoles,
  identityModeFromEnvironment,
  parseEntraIdentity,
  productionConfigurationReport,
  roleFromEntraAppRoles,
} from "./identity";

const validProfile = {
  oid: "10000000-0000-4000-8000-000000000001",
  tid: "20000000-0000-4000-8000-000000000002",
  name: "Maaike Werknemer",
  preferred_username: "maaike@example.nl",
  roles: [entraAppRoles.employee],
};

describe("Microsoft Entra-identiteit", () => {
  it("kiest management wanneer beide app-rollen aanwezig zijn", () => {
    expect(roleFromEntraAppRoles([
      entraAppRoles.employee,
      entraAppRoles.management,
    ])).toBe("management");
  });

  it("weigert een account zonder expliciete KeyFlow-app-rol", () => {
    expect(() => roleFromEntraAppRoles(["Onbekende.Rol"])).toThrowError(
      expect.objectContaining<Partial<IdentityClaimsError>>({
        code: "ROLE_NOT_ASSIGNED",
      }),
    );
  });

  it("maakt een stabiele tenantgebonden externe gebruikerssleutel", () => {
    expect(parseEntraIdentity(validProfile)).toEqual({
      externalId: "20000000-0000-4000-8000-000000000002:10000000-0000-4000-8000-000000000001",
      tenantId: "20000000-0000-4000-8000-000000000002",
      objectId: "10000000-0000-4000-8000-000000000001",
      displayName: "Maaike Werknemer",
      email: "maaike@example.nl",
      role: "employee",
      mode: "entra",
    });
  });

  it("valt zonder expliciete instelling veilig terug op pilotmodus", () => {
    expect(identityModeFromEnvironment({})).toBe("pilot");
    expect(identityModeFromEnvironment({ KEYFLOW_AUTH_MODE: "entra" })).toBe("entra");
  });
});

describe("productieconfiguratie", () => {
  it("is pas gereed wanneer database, Entra en HTTPS volledig zijn ingesteld", () => {
    const report = productionConfigurationReport({
      KEYFLOW_AUTH_MODE: "entra",
      DATABASE_URL: "postgres://keyflow:secret@database.example.nl/keyflow",
      AUTH_SECRET: "a".repeat(32),
      AUTH_MICROSOFT_ENTRA_ID_ID: "30000000-0000-4000-8000-000000000003",
      AUTH_MICROSOFT_ENTRA_ID_SECRET: "client-secret-value",
      AUTH_MICROSOFT_ENTRA_ID_ISSUER:
        "https://login.microsoftonline.com/20000000-0000-4000-8000-000000000002/v2.0",
      AUTH_TRUST_HOST: "true",
      KEYFLOW_BASE_URL: "https://keyflow.example.nl",
    });

    expect(report.ready).toBe(true);
    expect(report.checks.every((check) => check.ready)).toBe(true);
  });

  it("rapporteert ontbrekende secrets zonder hun waarde te lekken", () => {
    const report = productionConfigurationReport({
      KEYFLOW_AUTH_MODE: "entra",
      DATABASE_URL: "postgres://keyflow:secret@database.example.nl/keyflow",
    });

    expect(report.ready).toBe(false);
    expect(report.checks.find(({ key }) => key === "auth_secret")?.detail)
      .toBe("AUTH_SECRET ontbreekt of is korter dan 32 tekens.");
    expect(JSON.stringify(report)).not.toContain("postgres://keyflow:secret");
  });
});
