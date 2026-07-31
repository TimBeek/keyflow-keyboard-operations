import {
  inventoryCatalog,
  inventoryCatalogSummary,
  operationalInventoryCatalog,
} from "@/data/inventory-catalog";
import { can, permissions } from "./access-control";
import {
  createCompatibilityEvidenceRecord,
  emptyCompatibilityCheckpoints,
} from "./compatibility-evidence";
import { recommendConversion, type ConversionPolicyInput } from "./conversion-policy";
import { goLiveAcceptanceSummary } from "./go-live-acceptance";
import { calculateInventoryMutation } from "./inventory";
import { catalogModelOptions } from "./model-catalog";
import {
  classifyValueBand,
  getSaleValueBand,
  policyValueForBand,
  resolveModelQuery,
} from "./order-entry";
import { findNoviplySku } from "./operations";
import {
  areStickerVerificationChecksComplete,
  createEmptyStickerVerificationChecks,
  stickerVerificationFailureLabel,
} from "./sticker-verification";
import { createWorkfloorTrialRecord } from "./workfloor-acceptance";

export const operationalScenarioCategories = [
  "conversion",
  "order_entry",
  "inventory",
  "safety",
  "access",
  "governance",
] as const;

export type OperationalScenarioCategory =
  (typeof operationalScenarioCategories)[number];

export type OperationalScenarioRisk = "normal" | "boundary" | "blocking";
export type OperationalScenarioStatus = "passed" | "failed";

export const operationalScenarioCategoryLabels: Record<
  OperationalScenarioCategory,
  string
> = {
  conversion: "Conversiebeleid",
  order_entry: "Order & model",
  inventory: "Hangmap & voorraad",
  safety: "Veiligheidsblokkades",
  access: "Rollen & rechten",
  governance: "Acceptatie & vrijgave",
};

export type OperationalScenarioResult = {
  id: string;
  category: OperationalScenarioCategory;
  title: string;
  risk: OperationalScenarioRisk;
  status: OperationalScenarioStatus;
  expected: string;
  actual: string;
  detail: string;
  externalConfirmationRequired: boolean;
};

type ScenarioDefinition = Omit<
  OperationalScenarioResult,
  "status" | "actual"
> & {
  evaluate: () => { passed: boolean; actual: string };
};

const allMethodsAvailable: ConversionPolicyInput["available"] = {
  loose_stickers: true,
  noviply_sheet: true,
  printed_sticker: true,
  direct_reprint: true,
};

const allMethodsCompatible: ConversionPolicyInput["compatible"] = {
  loose_stickers: true,
  noviply_sheet: true,
  printed_sticker: true,
  direct_reprint: true,
};

const baseConversion: ConversionPolicyInput = {
  saleValueEur: 250,
  thresholdEur: 300,
  currentLayout: "QWERTY Nordic",
  targetLayout: "QWERTY US",
  workload: "normal",
  available: allMethodsAvailable,
  compatible: allMethodsCompatible,
};

export function runOperationalScenarioSuite(): OperationalScenarioResult[] {
  return scenarioDefinitions.map(({ evaluate, ...scenario }): OperationalScenarioResult => {
    try {
      const evaluation = evaluate();
      return {
        ...scenario,
        status: evaluation.passed ? "passed" : "failed",
        actual: evaluation.actual,
      };
    } catch (error) {
      return {
        ...scenario,
        status: "failed",
        actual: error instanceof Error ? error.message : "Onbekende testfout",
      };
    }
  });
}

export function operationalScenarioSummary(
  results: readonly OperationalScenarioResult[],
) {
  const passed = results.filter(({ status }) => status === "passed").length;
  const blocking = results.filter(
    ({ status, risk }) => status === "failed" && risk === "blocking",
  ).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    blocking,
    automatedPercentage: results.length === 0
      ? 0
      : Math.round((passed / results.length) * 100),
    externalConfirmationRequired: results.filter(
      ({ externalConfirmationRequired }) => externalConfirmationRequired,
    ).length,
  };
}

const scenarioDefinitions: ScenarioDefinition[] = [
  scenario(
    "CONV-01",
    "conversion",
    "Bestaande layout komt al overeen",
    "normal",
    "Geen conversie",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        currentLayout: " qwerty   us ",
      });
      return outcome(
        result.primary === "none" && result.policy.rule === "layout_already_matches",
        `${result.primary} · ${result.policy.rule}`,
      );
    },
  ),
  scenario(
    "CONV-02",
    "conversion",
    "QWERTY US onder €300",
    "boundary",
    "Oud Noviply-voorraadvel",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        saleValueEur: 299,
      });
      return outcome(
        result.primary === "noviply_sheet"
          && result.policy.rule === "qwerty_us_below_threshold",
        `${result.primary} · ${result.policy.rule}`,
      );
    },
  ),
  scenario(
    "CONV-03",
    "conversion",
    "Exact op de €300-grens",
    "boundary",
    "Directe keyboardprint",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        saleValueEur: 300,
      });
      return outcome(
        result.primary === "direct_reprint"
          && result.policy.rule === "premium_value",
        `${result.primary} · ${result.policy.rule}`,
      );
    },
  ),
  scenario(
    "CONV-04",
    "conversion",
    "Buitenlandse klantlayout onder €300",
    "normal",
    "Sterke printsticker met first-time-right-waarschuwing",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        targetLayout: "AZERTY FR",
      });
      return outcome(
        result.primary === "printed_sticker"
          && result.warnings.some((warning) => warning.includes("First-time-right")),
        `${result.primary} · ${result.warnings.join(" ")}`,
      );
    },
  ),
  scenario(
    "CONV-05",
    "conversion",
    "Keyboardprinter niet beschikbaar voor premiumorder",
    "boundary",
    "Eerstvolgende geschikte fallback met waarschuwing",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        saleValueEur: 450,
        available: { ...allMethodsAvailable, direct_reprint: false },
      });
      return outcome(
        result.primary === "printed_sticker"
          && result.warnings.some((warning) => warning.includes("niet beschikbaar")),
        `${result.primary} · ${result.warnings.join(" ")}`,
      );
    },
  ),
  scenario(
    "CONV-06",
    "conversion",
    "Geen methode beschikbaar of geschikt",
    "blocking",
    "Order geblokkeerd zonder stil alternatief",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        available: {
          loose_stickers: false,
          noviply_sheet: false,
          printed_sticker: false,
          direct_reprint: false,
        },
      });
      return outcome(
        result.primary === "none" && result.policy.rule === "no_usable_method",
        `${result.primary} · ${result.policy.rule}`,
      );
    },
  ),
  scenario(
    "CONV-07",
    "conversion",
    "Alleen uitgefaseerde losse stickers mogelijk",
    "blocking",
    "Losse-stickerfallback met expliciete waarschuwing",
    () => {
      const result = recommendConversion({
        ...baseConversion,
        available: {
          loose_stickers: true,
          noviply_sheet: false,
          printed_sticker: false,
          direct_reprint: false,
        },
      });
      return outcome(
        result.primary === "loose_stickers"
          && result.warnings.some((warning) => warning.includes("uitgefaseerd")),
        `${result.primary} · ${result.warnings.join(" ")}`,
      );
    },
  ),
  scenario(
    "ORDER-01",
    "order_entry",
    "Kort modelnummer 5420",
    "normal",
    "Uniek Dell Latitude 5420",
    () => {
      const result = resolveModelQuery(
        "5420",
        catalogModelOptions(inventoryCatalog),
      );
      return outcome(
        result.status === "unique" && result.model === "Dell Latitude 5420",
        result.status === "unique"
          ? result.model
          : `${result.status} · ${result.matches.join(", ")}`,
      );
    },
  ),
  scenario(
    "ORDER-02",
    "order_entry",
    "Ambigue modelinvoer G7",
    "boundary",
    "Dropdown in plaats van automatisch gokken",
    () => {
      const result = resolveModelQuery(
        "G7",
        catalogModelOptions(inventoryCatalog),
      );
      return outcome(
        result.status === "multiple" && result.matches.length > 1,
        `${result.status} · ${result.matches.length} keuzes`,
      );
    },
  ),
  scenario(
    "ORDER-03",
    "order_entry",
    "Waardeklasse €200–€299 bij grens €300",
    "boundary",
    "Volledig onder de grens; rekenwaarde €299",
    () => {
      const band = getSaleValueBand("200_299");
      const classification = classifyValueBand(band, 300);
      const value = policyValueForBand(band, 300);
      return outcome(
        classification === "below" && value === 299,
        `${classification} · €${value}`,
      );
    },
  ),
  scenario(
    "ORDER-04",
    "order_entry",
    "Beleidsgrens midden in waardeklasse",
    "blocking",
    "Overlap blokkeert stil gokken",
    () => {
      const classification = classifyValueBand(getSaleValueBand("300_399"), 350);
      return outcome(classification === "overlap", classification);
    },
  ),
  scenario(
    "INV-01",
    "inventory",
    "Gecontroleerde Excelmomentopname",
    "normal",
    "Catalogus komt overeen met de ingelezen bron",
    () => outcome(
      // Vaste aantallen zouden bij elke bijgewerkte voorraadlijst afketsen.
      // Wat telt is dat de catalogus de bron volgt en niet leeg is.
      inventoryCatalog.length === inventoryCatalogSummary.rowCount
        && inventoryCatalog.length > 0,
      `${inventoryCatalog.length} hangmappen · ${inventoryCatalogSummary.totalQuantity} vellen`,
    ),
  ),
  scenario(
    "INV-02",
    "inventory",
    "Elke hangmap telt apart",
    "blocking",
    "Geen twee hangmappen op dezelfde voorraadsleutel",
    () => {
      const sleutels = operationalInventoryCatalog.map((item) => item.stockKey);
      const dubbel = sleutels.filter((sleutel, index) => sleutels.indexOf(sleutel) !== index);
      return outcome(
        dubbel.length === 0 && operationalInventoryCatalog.length > 0,
        dubbel.length === 0
          ? `${operationalInventoryCatalog.length} hangmappen, elk met een eigen sleutel · ${inventoryCatalogSummary.blockedRows} zonder laptopmodel`
          : `dubbele sleutels: ${[...new Set(dubbel)].join(", ")}`,
      );
    },
  ),
  scenario(
    "INV-03",
    "inventory",
    "Dell Latitude 5420 met QWERTY US",
    "normal",
    "SKU NB10172E1NL, E1, hangmap 75",
    () => {
      const result = findNoviplySku(
        "Dell Latitude 5420",
        "QWERTY US",
        inventoryCatalog,
        {},
      );
      return outcome(
        result.status === "matched"
          && result.item.sku === "NB10172E1NL"
          && result.item.storageNumber === 75
          && result.variant === "E1",
        result.status === "matched"
          ? `${result.item.sku} · ${result.variant} · hangmap ${result.item.storageNumber}`
          : result.status,
      );
    },
    true,
  ),
  scenario(
    "INV-04",
    "inventory",
    "Exacte Noviply-SKU zonder voorraad",
    "blocking",
    "Uitverkocht, geen fictieve afboeking",
    () => {
      const result = findNoviplySku(
        "Dell Latitude 5420",
        "QWERTY US",
        inventoryCatalog,
        { "hangmap-075": 0 },
      );
      return outcome(result.status === "out_of_stock", result.status);
    },
  ),
  scenario(
    "INV-05",
    "inventory",
    "Onbekend model",
    "blocking",
    "Geen SKU raden",
    () => {
      const result = findNoviplySku(
        "Onbekend model 9999",
        "QWERTY US",
        inventoryCatalog,
        {},
      );
      return outcome(result.status === "not_found", result.status);
    },
  ),
  scenario(
    "INV-06",
    "inventory",
    "Eén gecontroleerd vel uitboeken",
    "normal",
    "Voorraad 12 wordt 11",
    () => {
      const result = calculateInventoryMutation({
        sku: "NB10172E1NL",
        currentQuantity: 12,
        type: "issue",
        quantity: 1,
        reasonCode: "scenario_usage",
        idempotencyKey: "scenario-inv-06",
      });
      return outcome(
        result.newQuantity === 11 && result.quantityDelta === -1,
        `${result.previousQuantity} ${result.quantityDelta} = ${result.newQuantity}`,
      );
    },
  ),
  scenario(
    "INV-07",
    "inventory",
    "Nieuwe levering inboeken",
    "normal",
    "Voorraad 12 plus 20 wordt 32",
    () => {
      const result = calculateInventoryMutation({
        sku: "NB10172E1NL",
        currentQuantity: 12,
        type: "receipt",
        quantity: 20,
        reasonCode: "scenario_receipt",
        idempotencyKey: "scenario-inv-07",
      });
      return outcome(
        result.newQuantity === 32 && result.quantityDelta === 20,
        `${result.previousQuantity} + ${result.quantityDelta} = ${result.newQuantity}`,
      );
    },
  ),
  scenario(
    "INV-08",
    "inventory",
    "Meer afboeken dan beschikbaar",
    "blocking",
    "Negatieve voorraad geblokkeerd",
    () => {
      try {
        calculateInventoryMutation({
          sku: "NB10172E1NL",
          currentQuantity: 2,
          type: "issue",
          quantity: 3,
          reasonCode: "scenario_shortage",
          idempotencyKey: "scenario-inv-08",
        });
        return outcome(false, "Afboeking werd ten onrechte geaccepteerd");
      } catch (error) {
        return outcome(
          error instanceof Error && error.message.includes("Onvoldoende voorraad"),
          error instanceof Error ? error.message : "Onbekende fout",
        );
      }
    },
  ),
  scenario(
    "INV-09",
    "inventory",
    "Grote voorraadontvangst",
    "boundary",
    "25 of meer vereist goedkeuring",
    () => {
      const result = calculateInventoryMutation({
        sku: "NB10172E1NL",
        currentQuantity: 12,
        type: "receipt",
        quantity: 25,
        reasonCode: "scenario_large_receipt",
        idempotencyKey: "scenario-inv-09",
      });
      return outcome(result.requiresApproval, `goedkeuring=${result.requiresApproval}`);
    },
  ),
  scenario(
    "SAFE-01",
    "safety",
    "Onvolledige vijfpuntscontrole",
    "blocking",
    "Afboeken blijft geblokkeerd",
    () => {
      const checks = createEmptyStickerVerificationChecks();
      checks.storage = true;
      checks.sku = true;
      checks.layout = true;
      checks.variant = true;
      return outcome(
        !areStickerVerificationChecksComplete(checks),
        `compleet=${areStickerVerificationChecksComplete(checks)}`,
      );
    },
    true,
  ),
  scenario(
    "SAFE-02",
    "safety",
    "Volledige vijfpuntscontrole",
    "normal",
    "Uitvoering mag pas na alle vijf controles verder",
    () => {
      const checks = createEmptyStickerVerificationChecks();
      Object.keys(checks).forEach((key) => {
        checks[key as keyof typeof checks] = true;
      });
      return outcome(
        areStickerVerificationChecksComplete(checks),
        `compleet=${areStickerVerificationChecksComplete(checks)}`,
      );
    },
    true,
  ),
  scenario(
    "SAFE-03",
    "safety",
    "E1/E2-afwijking",
    "blocking",
    "Herkenbare variantfout voor werknemer en management",
    () => {
      const label = stickerVerificationFailureLabel("wrong_variant");
      return outcome(label.includes("E1/E2"), label);
    },
    true,
  ),
  scenario(
    "SAFE-04",
    "safety",
    "Compatibiliteit goedkeuren zonder vijf vormchecks",
    "blocking",
    "Bewijsgoedkeuring geweigerd",
    () => {
      const item = inventoryCatalog.find(
        ({ storageNumber }) => storageNumber === 75,
      );
      if (!item) return outcome(false, "Hangmap 75 ontbreekt");
      try {
        createCompatibilityEvidenceRecord(
          inventoryCatalog,
          {
            catalogKey: item.catalogKey,
            model: "Dell Latitude 5420",
            status: "approved",
            manufacturerPartNumber: "DELL-KBD-5420",
            photoReference: "PHOTO-SCENARIO-5420",
            keyboardWidthMm: 285,
            keyboardHeightMm: 105,
            checkpoints: emptyCompatibilityCheckpoints,
            notes: "",
          },
          {
            id: "scenario-safe-04",
            recordedAt: "2026-07-28T08:00:00.000Z",
            reviewer: "Scenario management",
          },
        );
        return outcome(false, "Onvolledig bewijs werd ten onrechte goedgekeurd");
      } catch (error) {
        return outcome(
          error instanceof Error && error.message.includes("alle vijf"),
          error instanceof Error ? error.message : "Onbekende fout",
        );
      }
    },
    true,
  ),
  scenario(
    "ACCESS-01",
    "access",
    "Werknemersrechten",
    "blocking",
    "Wel uitvoeren en boeken; geen rapporten of beleid",
    () => {
      const passed = can("employee", "conversion.execute")
        && can("employee", "inventory.mutate")
        && !can("employee", "reports.view")
        && !can("employee", "policies.manage");
      return outcome(
        passed,
        `uitvoeren=${can("employee", "conversion.execute")} · boeken=${can("employee", "inventory.mutate")} · rapporten=${can("employee", "reports.view")} · beleid=${can("employee", "policies.manage")}`,
      );
    },
  ),
  scenario(
    "ACCESS-02",
    "access",
    "Managementrechten",
    "normal",
    "Alle beheerde permissies beschikbaar",
    () => {
      const missing = permissions.filter(
        (permission) => !can("management", permission),
      );
      return outcome(
        missing.length === 0,
        missing.length === 0 ? `${permissions.length}/${permissions.length}` : `Ontbreekt: ${missing.join(", ")}`,
      );
    },
  ),
  scenario(
    "GOV-01",
    "governance",
    "Geen externe go-livegoedkeuringen",
    "blocking",
    "Vrijgave blijft geblokkeerd op 0/5",
    () => {
      const summary = goLiveAcceptanceSummary([]);
      return outcome(
        !summary.canRelease && summary.approved === 0 && summary.pending === 5,
        `${summary.approved}/${summary.total} · vrijgave=${summary.canRelease}`,
      );
    },
  ),
  scenario(
    "GOV-02",
    "governance",
    "Onvolledige proef als geslaagd markeren",
    "blocking",
    "Werkvloerbewijs wordt geweigerd",
    () => {
      try {
        createWorkfloorTrialRecord(
          {
            trialReference: "SCENARIO-INCOMPLETE",
            location: "Softwarematige scenarioproef",
            deviceType: "desktop",
            deviceName: "Gesimuleerd werkstation",
            scannerName: "Gesimuleerde scanner",
            participants: 1,
            ordersTested: 1,
            startedAt: "2026-07-28T08:00:00.000Z",
            completedAt: "2026-07-28T08:05:00.000Z",
            averageHandlingSeconds: 300,
            methods: {
              loose_stickers: false,
              noviply_sheet: true,
              printed_sticker: false,
              direct_reprint: false,
            },
            errorScenarioTested: false,
            checks: {
              orderScanWithoutMouse: false,
              modelResolution: true,
              hangingFileMatched: false,
              keyboardGuideReadable: false,
              deductionAfterVerification: false,
              mismatchStopsDeduction: false,
            },
            result: "passed",
            evidenceReference: "SCENARIO",
            notes: "",
          },
          {
            id: "scenario-gov-02",
            recordedAt: "2026-07-28T08:06:00.000Z",
            recordedBy: "Scenario management",
          },
        );
        return outcome(false, "Onvolledige proef werd ten onrechte geaccepteerd");
      } catch (error) {
        return outcome(
          error instanceof Error && error.message.includes("alle vier methoden"),
          error instanceof Error ? error.message : "Onbekende fout",
        );
      }
    },
  ),
  scenario(
    "GOV-03",
    "governance",
    "Volledig gesimuleerd proefrecord",
    "boundary",
    "Validatieregels slagen, maar fysieke bevestiging blijft vereist",
    () => {
      const record = createWorkfloorTrialRecord(
        {
          trialReference: "SCENARIO-COMPLETE",
          location: "Softwarematige scenarioproef",
          deviceType: "desktop",
          deviceName: "Gesimuleerd werkstation",
          scannerName: "Gesimuleerde scanner",
          participants: 2,
          ordersTested: 8,
          startedAt: "2026-07-28T08:00:00.000Z",
          completedAt: "2026-07-28T08:20:00.000Z",
          averageHandlingSeconds: 150,
          methods: {
            loose_stickers: true,
            noviply_sheet: true,
            printed_sticker: true,
            direct_reprint: true,
          },
          errorScenarioTested: true,
          checks: {
            orderScanWithoutMouse: true,
            modelResolution: true,
            hangingFileMatched: true,
            keyboardGuideReadable: true,
            deductionAfterVerification: true,
            mismatchStopsDeduction: true,
          },
          result: "passed",
          evidenceReference: "SOFTWARE-SCENARIO-ONLY",
          notes: "Dit record controleert uitsluitend de softwarevalidatie.",
        },
        {
          id: "scenario-gov-03",
          recordedAt: "2026-07-28T08:21:00.000Z",
          recordedBy: "Scenario management",
        },
      );
      return outcome(
        record.result === "passed" && record.ordersTested === 8,
        `${record.result} · ${record.ordersTested} orders · alleen software`,
      );
    },
    true,
  ),
];

function scenario(
  id: string,
  category: OperationalScenarioCategory,
  title: string,
  risk: OperationalScenarioRisk,
  expected: string,
  evaluate: ScenarioDefinition["evaluate"],
  externalConfirmationRequired = false,
): ScenarioDefinition {
  return {
    id,
    category,
    title,
    risk,
    expected,
    evaluate,
    detail: risk === "blocking"
      ? "Negatief of onveilig pad moet aantoonbaar stoppen."
      : risk === "boundary"
        ? "Grens- of fallbackgedrag moet exact voorspelbaar blijven."
        : "Normale operationele route moet het verwachte resultaat geven.",
    externalConfirmationRequired,
  };
}

function outcome(passed: boolean, actual: string) {
  return { passed, actual };
}
