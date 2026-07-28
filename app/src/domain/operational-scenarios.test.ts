import { describe, expect, it } from "vitest";
import {
  operationalScenarioCategories,
  operationalScenarioSummary,
  runOperationalScenarioSuite,
} from "./operational-scenarios";

describe("operationele scenariomatrix", () => {
  const results = runOperationalScenarioSuite();

  it("dekt 29 expliciete normale, grens- en blokkeerscenario's", () => {
    expect(results).toHaveLength(29);
    expect(new Set(results.map(({ id }) => id)).size).toBe(29);
    expect(results.some(({ risk }) => risk === "normal")).toBe(true);
    expect(results.some(({ risk }) => risk === "boundary")).toBe(true);
    expect(results.some(({ risk }) => risk === "blocking")).toBe(true);
  });

  it.each(operationalScenarioCategories)(
    "dekt categorie %s",
    (category) => {
      expect(results.some((result) => result.category === category)).toBe(true);
    },
  );

  it.each(results)("$id · $title", (result) => {
    expect(result.status, result.actual).toBe("passed");
  });

  it("scheidt automatische bewijsdekking van fysieke bevestiging", () => {
    const summary = operationalScenarioSummary(results);

    expect(summary).toMatchObject({
      total: 29,
      passed: 29,
      failed: 0,
      blocking: 0,
      automatedPercentage: 100,
    });
    expect(summary.externalConfirmationRequired).toBeGreaterThan(0);
  });
});
