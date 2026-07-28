import { describe, expect, it } from "vitest";
import { operationsReadiness } from "./operations-readiness-service";

const databaseConfigured = Boolean(process.env.DATABASE_URL);

describe.skipIf(!databaseConfigured)("centrale operationele readiness", () => {
  it("leest na bootstrap en herstel-smoketest een volledig sluitend rapport", async () => {
    const actorId = process.env.KEYFLOW_IMPORT_ACTOR_ID;
    if (!actorId) throw new Error("KEYFLOW_IMPORT_ACTOR_ID ontbreekt.");

    const report = await operationsReadiness(actorId, {
      ...process.env,
      KEYFLOW_RECOVERY_MAX_AGE_DAYS: "90",
    });

    expect(report).toMatchObject({
      ready: true,
      databaseReady: true,
      latestMigration: "0015_go_live_acceptance.sql",
      snapshot: {
        status: "applied",
        rowCount: 148,
        totalQuantity: 3218,
      },
      inventory: {
        operationalRows: 139,
        linkedBalances: 139,
      },
      latestRecoveryDrill: {
        result: "passed",
        backupReference: "ci-ephemeral-database-registration-smoke",
      },
    });
    expect(report.inventory.onHand).toBe(report.inventory.ledgerQuantity);
    expect(report.checks).toHaveLength(4);
    expect(report.checks.every(({ ready }) => ready)).toBe(true);
  });
});
