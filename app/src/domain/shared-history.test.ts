import { describe, expect, it } from "vitest";
import { reportPeriods } from "./reporting";
import { usageWindowWeeks } from "./resupply";
import {
  longestReportDays,
  requiredHistoryDays,
  sharedTransactionDays,
} from "./shared-history";

/**
 * Deze test bestaat om één soort fout tegen te houden: iemand voegt een langere
 * rapportageperiode toe, het venster groeit niet mee, en de grafiek toont
 * stilletjes minder dan hij belooft. Dan hoort dit om te vallen.
 */

describe("het venster van de gedeelde geschiedenis", () => {
  it("dekt de langste rapportperiode én de periode ervoor", () => {
    expect(requiredHistoryDays()).toBeGreaterThanOrEqual(longestReportDays() * 2);
  });

  it("dekt het venster waarover het bijbestelniveau wordt gemeten", () => {
    expect(requiredHistoryDays()).toBeGreaterThanOrEqual(usageWindowWeeks * 7);
  });

  it("houdt marge, zodat een rapport aan de rand niet net buiten valt", () => {
    expect(sharedTransactionDays).toBeGreaterThan(requiredHistoryDays());
  });

  it("groeit mee met de periodes die er werkelijk zijn", () => {
    // Niet een rond getal dat los staat van de schermen: als hier ooit een
    // periode van een jaar bij komt, hoort het venster mee te schuiven.
    const langste = Math.max(...reportPeriods.map((period) => period.days));

    expect(longestReportDays()).toBe(langste);
    expect(sharedTransactionDays).toBeGreaterThanOrEqual(langste * 2);
  });
});
