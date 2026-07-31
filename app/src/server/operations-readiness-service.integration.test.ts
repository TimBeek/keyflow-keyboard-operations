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

    /*
     * Bewust geen vaste getallen meer.
     *
     * Hier stond het migratienummer 0016 vastgepind, met een voorraadtotaal van
     * 3218 en 139 bruikbare hangmappen. Alle drie veranderen bij gewoon werk:
     * een nieuwe migratie, een telling, een hangmap die bruikbaar wordt. Deze
     * test viel daardoor om terwijl er niets mis was — en een test die omvalt
     * bij goed nieuws wordt genegeerd, en dan vangt hij het echte geval ook
     * niet meer.
     *
     * Wat wél moet kloppen is de samenhang: de database is bij, de bronlijst is
     * ingelezen, elke bruikbare hangmap heeft een voorraadregel, en de optelsom
     * van de boekingen komt uit op wat er in de kast ligt.
     */
    expect(report).toMatchObject({
      ready: true,
      databaseReady: true,
      snapshot: { status: "applied" },
      latestRecoveryDrill: { result: "passed" },
    });
    expect(report.latestMigration).toMatch(/^\d{4}_.+\.sql$/);
    expect(report.snapshot.rowCount).toBeGreaterThan(100);
    expect(report.snapshot.totalQuantity).toBeGreaterThan(0);
    // Elke hangmap die de app mag gebruiken heeft ook echt een voorraadregel.
    expect(report.inventory.linkedBalances).toBe(report.inventory.operationalRows);
    // De boekingen tellen op tot wat er ligt; loopt dat uiteen, dan is er
    // ergens een afboeking kwijt of dubbel verwerkt.
    expect(report.inventory.onHand).toBe(report.inventory.ledgerQuantity);
    expect(report.checks).toHaveLength(4);
    expect(report.checks.every(({ ready }) => ready)).toBe(true);
  });
});
