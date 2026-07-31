"use client";

import { useMemo, useRef, useState } from "react";
import type { InventoryCatalogItem } from "@/data/inventory-catalog";
import {
  latestCompatibilityEvidence,
  type CompatibilityEvidenceRecord,
} from "@/domain/compatibility-evidence";
import type { WorkOrderSnapshot } from "@/domain/order-lookup";
import {
  methodLabel,
  methodProfile,
  methodStars,
  recommendConversion,
  type ConversionMethodId,
} from "@/domain/conversion-policy";
import {
  findNoviplySku,
  layoutWithCountry,
  type InventoryMutationOutcome,
  type InventoryMutationRequest,
  type OperationsPolicy,
} from "@/domain/operations";
import {
  getSaleValueBand,
  policyValueForBand,
  saleValueBands,
  type SaleValueBandId,
} from "@/domain/order-entry";
import {
  stickerVerificationFailureLabel,
  type StickerVerificationFailureReason,
  type StickerVerificationReportInput,
} from "@/domain/sticker-verification";
import {
  genericNordicLayout,
  normalizeLayoutName,
  targetLayoutOptions,
} from "@/domain/keyboard-layouts";
import { catalogModelOptions } from "@/domain/model-catalog";
import { buildModelChoices, searchModelMatches } from "@/domain/model-search";
import type { PrintRequestInput, PrintRequestRecord } from "@/domain/print-requests";
import { printingNow, type PrinterCheckRecord } from "@/domain/printer-check";
import {
  groupPrintRequests,
  isFresh,
  openCount,
  printRequestHeadline,
  waitingTooLong,
} from "@/domain/print-request-status";
import type { ConversionLogInput } from "@/domain/conversion-log";
import { directPrintScopeFor } from "@/domain/direct-print-scope";
import {
  noviplyBlockedFor,
  unavailableReasonLabel,
  type NoviplyUnavailableRecord,
} from "@/domain/noviply-availability";
import { EnterShapeGlyph } from "@/components/enter-shape-glyph";
import { nextPrintRun, type PrintRun } from "@/domain/print-runs";
import { batchLabel, batchRowForOrder, type PrintBatch } from "@/domain/print-batch";
import {
  groupRunWaitlist,
  type RunWaitlistEntry,
  type RunWaitlistInput,
} from "@/domain/run-waitlist";

/**
 * Eén concrete handeling per methode. Bewust geen lijst met werkinstructies:
 * de medewerker moet weten wát hij doet, niet dát er instructies bestaan.
 */
function todoFor(method: ConversionMethodId, storageNumber: number | null): string {
  switch (method) {
    case "noviply_sheet":
      // Het hangmapnummer staat er al groot boven; dat hier herhalen maakt de
      // zin langer zonder dat iemand er iets van weet wat hij nog niet wist.
      return storageNumber === null
        ? "Pak het voorraadvel. Leg het los op het toetsenbord — past het? Breng het in één beweging aan."
        : "Pak het vel. Leg het eerst los op het toetsenbord — past het? Breng het in één beweging aan.";
    case "printed_sticker":
      return "Breng de printsticker in één keer aan. Herpositioneren kan niet.";
    case "direct_reprint":
      return "Zet de laptop in de wachtrij voor de toetsenbordsprinter.";
    case "loose_stickers":
      return "Alleen met toestemming van je teamleider: plak de losse stickers toets voor toets.";
    case "none":
    default:
      return "Geen conversie nodig. Zet de laptop door.";
  }
}

const failureOptions: { value: StickerVerificationFailureReason; label: string }[] = [
  { value: "position_mismatch", label: "Past niet goed / uitlijning klopt niet" },
  { value: "wrong_variant", label: "Verkeerde entervorm (E1/E2)" },
  { value: "wrong_layout", label: "Taal op het vel klopt niet" },
  { value: "wrong_sku", label: "Verkeerd stickernummer in de hangmap" },
  { value: "wrong_storage", label: "Verkeerde hangmap" },
  { value: "other", label: "Iets anders" },
];

type Tab = "advice" | "receive" | "requests";

/**
 * De Enter-toets verraadt de entervorm, en die bepaalt uit welke hangmap het vel
 * komt. De lege waarde is de beginstand — nog niets gekozen — en niet meer een
 * knop: "weet ik niet" leverde een advies op dat de vorm niet meewoog, en dan
 * kan het verkeerde vel uit de kast komen.
 */
type EnterShapeId = "" | "E1" | "E2";

/** Bestanden uit /public krijgen het basispad van een projectsite niet vanzelf. */
const assetBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const enterShapeChoices: { id: EnterShapeId; label: string; detail: string; image?: string }[] = [
  {
    id: "E1",
    label: "E1",
    detail: "Grote Enter, omgekeerde L",
    image: `${assetBase}/keyboard-reference-e1-dell-v3.png`,
  },
  {
    id: "E2",
    label: "E2",
    detail: "Kleine, rechthoekige Enter",
    image: `${assetBase}/keyboard-reference-e2-dell-v3.png`,
  },
];

type Props = {
  catalog: InventoryCatalogItem[];
  actorName: string;
  orders: WorkOrderSnapshot[];
  quantities: Record<string, number>;
  policy: OperationsPolicy;
  /** De layouts die de toetsenbordsprinter aankan; leeg = nog niet ingevuld. */
  directPrintLayouts: string[];
  printRequests: PrintRequestRecord[];
  printerChecks: PrinterCheckRecord[];
  onRemindNoviply: () => void;
  compatibilityEvidenceRecords: CompatibilityEvidenceRecord[];
  onInventoryMutation: (request: InventoryMutationRequest) => Promise<InventoryMutationOutcome>;
  onStickerVerification: (input: StickerVerificationReportInput) => unknown;
  onRequestPrintSticker: (input: PrintRequestInput) => unknown;
  onRecordConversion: (input: ConversionLogInput) => unknown;
  /** Laptops die apart staan tot de volgende automatische printronde. */
  runWaitlist: RunWaitlistEntry[];
  /** De ingelezen rondes; daarin is te zien of het vel er echt aan komt. */
  printBatches: PrintBatch[];
  /** Wat Noviply naar eigen zeggen niet kan printen. */
  noviplyUnavailable: NoviplyUnavailableRecord[];
  onWaitForPrintRun: (input: RunWaitlistInput) => Promise<unknown>;
  onSettleRunWait: (id: string, outcome: "collected" | "escalated") => void;
};

export function EmployeeWorkspace({
  catalog,
  actorName,
  quantities,
  policy,
  directPrintLayouts,
  printRequests,
  printerChecks,
  onRemindNoviply,
  compatibilityEvidenceRecords,
  onInventoryMutation,
  onStickerVerification,
  onRequestPrintSticker,
  onRecordConversion,
  runWaitlist,
  printBatches,
  noviplyUnavailable,
  onWaitForPrintRun,
  onSettleRunWait,
}: Props) {
  const [tab, setTab] = useState<Tab>("advice");
  // Tussenstap voor de premiumsticker: pas na de pakbondatum weten we of dit
  // een aanvraag is of gewoon afwachten.
  const [askingSlipDate, setAskingSlipDate] = useState(false);

  /* ---------- tabblad 3: wat deed Noviply met mijn aanvraag? ---------- */
  // Wie een sticker aanvraagt zet de laptop apart en gaat door. Zonder
  // terugkoppeling blijft die staan tot iemand er toevallig langsloopt.
  // Bewust elke render opnieuw: "sinds kort afgehandeld" moet meelopen met de
  // klok, niet blijven staan op het moment dat het scherm openging.
  const now = new Date();
  const requestGroups = useMemo(() => groupPrintRequests(printRequests), [printRequests]);
  /**
   * Zoeken op ordernummer of model. Zodra er een dag of wat gewerkt is staan er
   * tientallen regels, en dan zoek je één order — niet een lijst.
   */
  const [requestZoek, setRequestZoek] = useState("");
  const zichtbaar = useMemo(() => {
    const woorden = requestZoek.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (woorden.length === 0) return requestGroups;
    const past = (request: PrintRequestRecord) => {
      const tekst = `${request.model} ${request.layout} ${request.variant} ${request.orderReference} ${request.note}`.toLowerCase();
      return woorden.every((woord) => tekst.includes(woord));
    };
    return {
      ready: requestGroups.ready.filter(past),
      waiting: requestGroups.waiting.filter(past),
      blocked: requestGroups.blocked.filter(past),
    };
  }, [requestGroups, requestZoek]);
  // De eerstvolgende automatische ronde van vandaag; niets = beide geweest.
  const nextRun = nextPrintRun(now, policy.printRunTimes);
  const todayLabel = now.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
  const waitGroups = useMemo(() => groupRunWaitlist(runWaitlist, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runWaitlist, now.getTime()]);
  // Wat er nog bij Noviply staat: "ik heb er zoveel uitstaan". Zodra er geprint
  // is valt het getal vanzelf weg.
  const openAtNoviply = openCount(printRequests);
  const tooLong = waitingTooLong(printRequests, now);

  /* ---------- tabblad 1: welke sticker? ---------- */
  const modelInputRef = useRef<HTMLInputElement>(null);
  const orderInputRef = useRef<HTMLInputElement>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  // Nederlands is wat er het vaakst langskomt; dat scheelt de werkvloer bij
  // elke laptop een keuze. De aanname over de binnenkomende layout hieronder
  // vangt op dat NL en QWERTY US op hetzelfde neerkomen.
  const [targetLayout, setTargetLayout] = useState("QWERTY NL");
  const [saleBandId, setSaleBandId] = useState<SaleValueBandId>("200_299");
  const [enterShape, setEnterShape] = useState<EnterShapeId>("");
  const [shapeHelpOpen, setShapeHelpOpen] = useState(false);
  const [orderReference, setOrderReference] = useState("");
  // Aan zodra iemand een aanvraag wil doen zonder ordernummer: dan licht het
  // veld op in plaats van dat er een melding onderaan verschijnt.
  const [orderMissing, setOrderMissing] = useState(false);
  // Eén order kan meerdere laptops zijn. Eén is verreweg het meest voorkomend,
  // dus dat blijft de stand waar niemand iets aan hoeft te doen.
  const [quantity, setQuantity] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [adviceMessage, setAdviceMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [failureReason, setFailureReason] = useState<StickerVerificationFailureReason>("position_mismatch");

  const modelOptions = useMemo(() => catalogModelOptions(catalog), [catalog]);
  /**
   * Niet alleen de modellen met een hangmap: er gaan er bijna tweeduizend door
   * de handen, en juist die zonder vel hebben een andere oplossing nodig.
   */
  const modelChoices = useMemo(() => buildModelChoices(modelOptions), [modelOptions]);
  const modelZoek = useMemo(
    () => searchModelMatches(modelChoices, modelQuery),
    [modelChoices, modelQuery],
  );
  const modelMatches = modelZoek.shown;
  const model = chosenModel ?? (modelMatches.length === 1 ? modelMatches[0].name : "");
  // Openstaan doet hij alleen als er echt iets te kiezen valt: bij één treffer
  // is het model al gekozen, en zonder treffers is er niets om uit te kiezen.
  const pickerOpen = chosenModel === null && modelMatches.length > 1;

  const saleBand = getSaleValueBand(saleBandId);
  const saleValue = policyValueForBand(saleBand, policy.thresholdEur);

  const noviplyMatch = useMemo(
    () => findNoviplySku(model, targetLayout, catalog, quantities, enterShape, (item) =>
      latestCompatibilityEvidence(compatibilityEvidenceRecords, item.catalogKey, model)?.status ?? null),
    [catalog, compatibilityEvidenceRecords, enterShape, model, quantities, targetLayout],
  );
  const matched = noviplyMatch.status === "matched" ? noviplyMatch : null;

  const evidence = useMemo(() => {
    if (noviplyMatch.status !== "matched" && noviplyMatch.status !== "out_of_stock") return null;
    return latestCompatibilityEvidence(compatibilityEvidenceRecords, noviplyMatch.item.catalogKey, model);
  }, [compatibilityEvidenceRecords, model, noviplyMatch]);

  /**
   * De laptop staat bij de stickerafdeling juist omdat de layout niet klopt.
   * We vragen de huidige layout dus niet uit, maar zorgen dat hij nooit gelijk
   * is aan de gewenste layout — anders adviseert de motor "geen conversie".
   */
  const assumedCurrentLayout =
    normalizeLayoutName(targetLayout) === normalizeLayoutName("QWERTY US")
      ? genericNordicLayout
      : "QWERTY US";

  /**
   * Wat Notebook Service met dít model kan. Onbekend is geen nee: dan valt de
   * app terug op de algemene lijst uit het beleid, in plaats van de werkvloer
   * tegen te houden om iets wat misschien prima kan.
   */
  const printScope = useMemo(
    () => directPrintScopeFor(model, targetLayout),
    [model, targetLayout],
  );

  /**
   * Heeft Noviply eerder gemeld dat ze dit model of deze taal niet hebben, dan
   * is de premiumsticker geen optie. Zonder dit adviseerde de app hem opnieuw,
   * deed de werkvloer opnieuw een aanvraag, en kwam dezelfde afwijzing terug.
   */
  const noviplyBlock = useMemo(
    () => noviplyBlockedFor(noviplyUnavailable, model, targetLayout),
    [model, noviplyUnavailable, targetLayout],
  );

  const recommendation = useMemo(() => recommendConversion({
    saleValueEur: saleValue,
    saleValueLabel: saleBand.label,
    thresholdEur: policy.thresholdEur,
    currentLayout: assumedCurrentLayout,
    targetLayout,
    workload: policy.workload,
    available: policy.methodEnabled,
    layoutRules: policy.layoutRules,
    directPrintLayouts: printScope.status === "unknown" ? directPrintLayouts : printScope.layouts,
    compatible: {
      loose_stickers: true,
      noviply_sheet: noviplyMatch.status === "matched" && evidence?.status !== "rejected",
      printed_sticker: noviplyBlock === null,
      direct_reprint: true,
    },
  }), [assumedCurrentLayout, directPrintLayouts, evidence?.status, noviplyBlock, noviplyMatch.status, policy, printScope, saleBand.label, saleValue, targetLayout]);

  /**
   * De toetsenbordsprinter kan deze taal niet. De laptop krijgt dan de
   * premiumsticker, maar die ligt er niet vanzelf: Noviply moet hem printen.
   */
  const printerFallback = recommendation.fellBackFrom === "direct_reprint";

  /**
   * De medewerker heeft zelf gemeld dat de toetsenbordsprint niet gaat. Nodig
   * omdat de koppeling met Roemenië niet sluitend is: zij noemen sommige
   * modellen bij hun interne nummer ("Surface 1950") en wij bij hun naam. Dan
   * vindt de app niets, adviseert vier sterren, en staat er iemand met een
   * laptop die daar niet doorheen kan.
   */
  const [printBlocked, setPrintBlocked] = useState(false);
  /**
   * Zit er een trackpoint op? Dat knopje tussen G, H en B verandert de indeling
   * van het toetsenbord. Noviply print het vel zonder de laptop te zien, dus
   * gaat een aanvraag niet weg voordat dit beantwoord is.
   */
  const [trackpoint, setTrackpoint] = useState<"" | "yes" | "no">("");
  const [trackpointMissing, setTrackpointMissing] = useState(false);
  const effectiveMethod: ConversionMethodId = printBlocked && recommendation.primary === "direct_reprint"
    ? "printed_sticker"
    : recommendation.primary;
  const fallbackToPremium = printerFallback || (printBlocked && recommendation.primary === "direct_reprint");

  const hasAnswer = model !== "";
  const usesSheet = effectiveMethod === "noviply_sheet";
  const storageNumber = matched?.item.storageNumber ?? null;

  /**
   * Leegmaken voor de volgende laptop. `keepMessage` blijft staan waar de
   * melding zelf de opdracht is — "zet deze laptop apart en wacht" mag niet
   * verdwijnen op het moment dat het scherm vrijmaakt voor de volgende.
   */
  function resetAdvice({ keepMessage = false } = {}) {
    setPrintBlocked(false);
    setModelQuery("");
    setChosenModel(null);
    setOrderReference("");
    setOrderMissing(false);
    setQuantity(1);
    setConfirmed(false);
    if (!keepMessage) setAdviceMessage(null);
    setIssueOpen(false);
    requestAnimationFrame(() => modelInputRef.current?.focus());
  }

  /**
   * Zonder registratie is een conversie zonder voorraadgevolg onzichtbaar, en
   * kan niemand zeggen hoeveel laptops er op een dag doorheen gingen. Een
   * mislukte registratie mag de medewerker echter nooit ophouden.
   */
  function logConversion(input: ConversionLogInput) {
    try {
      onRecordConversion(input);
    } catch {
      // Bewust stil: de laptop is klaar, dat telt op de werkvloer.
    }
  }

  /**
   * Soms zit de gevraagde taal er al op.
   *
   * De adviesmotor kent dit geval al — hij geeft "geen conversie" als de
   * huidige layout gelijk is aan de gewenste — maar dit scherm vroeg de huidige
   * layout nooit uit en vulde er expres iets anders in. De laptop stond immers
   * bij de stickerafdeling omdat er iets moest gebeuren. Dat klopt niet altijd:
   * er komt er af en toe een langs die toevallig al goed is, en die hoeft dan
   * niet door een van de vier methodes.
   *
   * Er gaat niets van de voorraad af, want er komt geen vel op. Hij wordt wel
   * vastgelegd, anders verdwijnt de laptop uit de telling en lijkt er minder
   * werk gedaan dan er is.
   */
  function alreadyCorrect() {
    logConversion({
      method: "none",
      status: "completed",
      model,
      targetLayout,
      variant: enterShape,
      orderReference,
      quantity,
    });
    resetAdvice();
    setAdviceMessage({
      tone: "ok",
      text: `Vastgelegd: dit toetsenbord is al ${targetLayout}. Er hoeft geen sticker op.`,
    });
  }

  /** De taal zoals hij op het vel komt te staan; die moet Noviply zien. */
  function stickerLayout() {
    return matched ? layoutWithCountry(matched.item.layout, matched.item.sku) : targetLayout;
  }

  /**
   * Het ordernummer is verplicht zodra Noviply erbij komt. Dat leverde eerst
   * een foutmelding onderaan op, terwijl het veld ergens anders stond. Nu
   * springt het veld zelf aan en krijgt het de aandacht — invullen in plaats
   * van eerst lezen wat er mis is.
   */
  function needsOrderNumber() {
    if (orderReference.trim()) return false;
    setOrderMissing(true);
    requestAnimationFrame(() => orderInputRef.current?.focus());
    return true;
  }

  /** Een echte aanvraag: Noviply moet dit vel apart printen. */
  function requestFromNoviply(reason: string) {
    if (needsOrderNumber()) return;
    if (!trackpoint) {
      setTrackpointMissing(true);
      return;
    }
    try {
      onRequestPrintSticker({
        model,
        layout: stickerLayout(),
        variant: enterShape,
        orderReference,
        quantity,
        trackpoint,
        reason,
      });
      // De laptop is voor de medewerker klaar, maar pas af als Noviply hem
      // geprint heeft. Dat verschil blijft zichtbaar in de rapportage.
      logConversion({
        method: "printed_sticker",
        status: "awaiting_print",
        model,
        targetLayout,
        variant: enterShape,
        orderReference,
        quantity,
        ...(fallbackToPremium ? { fellBackFrom: "direct_reprint" as const } : {}),
      });
      setTrackpoint("");
      setTrackpointMissing(false);
      setAdviceMessage({
        tone: "ok",
        text: `Aangevraagd bij Noviply voor order ${orderReference.trim()}. `
          + "ZET DEZE LAPTOP APART en wacht tot Noviply hem geprint heeft — ga zelf verder met de volgende.",
      });
      setAskingSlipDate(false);
      resetAdvice({ keepMessage: true });
    } catch (error) {
      setAdviceMessage({
        tone: "warn",
        text: error instanceof Error ? error.message : "Aanvragen is niet gelukt.",
      });
    }
  }

  /**
   * Geen aanvraag maar afwachten: dit vel rolt vanzelf uit de eerstvolgende
   * ronde. Wel apart leggen, en de laptop komt op de gedeelde wachtlijst zodat
   * hij na de ronde bij iemand terugkomt.
   */
  async function waitForRun(run: PrintRun) {
    if (needsOrderNumber()) return;
    try {
      await onWaitForPrintRun({
        model,
        layout: stickerLayout(),
        variant: enterShape,
        orderReference,
        quantity,
        expectedRunAt: run.at.toISOString(),
        expectedRunLabel: run.label,
      });
      logConversion({
        method: "printed_sticker",
        status: "awaiting_print",
        model,
        targetLayout,
        variant: enterShape,
        orderReference,
        quantity,
      });
      setAdviceMessage({
        tone: "ok",
        text: `Order ${orderReference.trim()} komt mee met de printronde van ${run.label}. `
          + "ZET DEZE LAPTOP APART en wacht tot Noviply hem geprint heeft — na de ronde vraagt dit scherm of het vel er lag.",
      });
      setAskingSlipDate(false);
      resetAdvice({ keepMessage: true });
    } catch (error) {
      setAdviceMessage({
        tone: "warn",
        text: error instanceof Error ? error.message : "Apart leggen is niet gelukt.",
      });
    }
  }

  async function bookDone() {
    if (!usesSheet) {
      // Ook zonder voorraadvel is de laptop klaar: leegmaken voor de volgende,
      // anders blijft hij op het scherm staan en weet niemand of het gelukt is.
      // "Geen conversie" is geen conversie: die hoort niet in de telling.
      if (effectiveMethod !== "none") {
        logConversion({
          method: effectiveMethod,
          status: "completed",
          model,
          targetLayout,
          variant: enterShape,
          orderReference,
          ...(fallbackToPremium ? { fellBackFrom: "direct_reprint" as const } : {}),
        });
      }
      setAdviceMessage({ tone: "ok", text: "Klaar. Deze methode gebruikt geen voorraadvel, er is niets afgeboekt. Pak de volgende laptop." });
      setConfirmed(false);
      setPrintBlocked(false);
      setModelQuery("");
      setChosenModel(null);
      setOrderReference("");
      requestAnimationFrame(() => modelInputRef.current?.focus());
      return;
    }
    if (!matched) {
      setAdviceMessage({ tone: "warn", text: "Er is geen bruikbaar voorraadvel voor dit model. Vraag je teamleider." });
      return;
    }
    try {
      const result = await onInventoryMutation({
        sku: matched.item.stockKey,
        type: "issue",
        quantity,
        reasonCode: "conversion_usage",
        notes: `Hangmap ${matched.item.storageNumber} · ${matched.variant} · ${targetLayout}`,
        reference: orderReference.trim() || undefined,
        actor: actorName,
      });
      onStickerVerification({
        orderReference: orderReference.trim(),
        sku: matched.item.sku,
        storageNumber: matched.item.storageNumber,
        model,
        targetLayout,
        variant: matched.variant,
        outcome: "passed",
      });
      logConversion({
        method: "noviply_sheet",
        status: "completed",
        model,
        targetLayout,
        variant: matched.variant,
        sku: matched.item.sku,
        storageNumber: matched.item.storageNumber,
        orderReference,
        quantity,
      });
      setAdviceMessage({
        tone: "ok",
        text: `Klaar. ${matched.item.sku} is afgeboekt, er liggen er nog ${result.newQuantity} in hangmap ${matched.item.storageNumber}.`,
      });
      setConfirmed(false);
      setModelQuery("");
      setChosenModel(null);
      setOrderReference("");
    } catch (error) {
      setAdviceMessage({ tone: "warn", text: error instanceof Error ? error.message : "Afboeken is niet gelukt." });
    }
  }

  async function reportIssue(bookAsScrap: boolean) {
    if (!matched) return;
    if (bookAsScrap && !policy.employeeCanBookMismatch) {
      setAdviceMessage({ tone: "warn", text: "Je mag geen uitval boeken. Geef het door aan je teamleider." });
      return;
    }
    try {
      let tail = "Er is niets afgeboekt.";
      if (bookAsScrap) {
        const result = await onInventoryMutation({
          sku: matched.item.stockKey,
          type: "issue",
          quantity: 1,
          reasonCode: "verification_scrap",
          notes: `${stickerVerificationFailureLabel(failureReason)} · hangmap ${matched.item.storageNumber}`,
          reference: orderReference.trim() || undefined,
          actor: actorName,
        });
        tail = `Het vel is als uitval afgeboekt, er liggen er nog ${result.newQuantity}.`;
      }
      onStickerVerification({
        orderReference: orderReference.trim(),
        sku: matched.item.sku,
        storageNumber: matched.item.storageNumber,
        model,
        targetLayout,
        variant: matched.variant,
        outcome: bookAsScrap ? "scrapped" : "blocked_unused",
        failureReason,
      });
      setAdviceMessage({
        tone: "warn",
        text: `${stickerVerificationFailureLabel(failureReason)}. ${tail} Pak niet zelf een andere variant — vraag je teamleider.`,
      });
      setIssueOpen(false);
      setConfirmed(false);
    } catch (error) {
      setAdviceMessage({ tone: "warn", text: error instanceof Error ? error.message : "Melden is niet gelukt." });
    }
  }

  /* ---------- tabblad 2: stickers ontvangen ---------- */
  const receiveInputRef = useRef<HTMLInputElement>(null);
  const [receiveQuery, setReceiveQuery] = useState("");
  const [receiveQuantity, setReceiveQuantity] = useState(1);
  const [receiveReference, setReceiveReference] = useState("");
  const [receiveMessage, setReceiveMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  /** Accepteert zowel een SKU als een modelnummer — de medewerker hoeft niet te weten welke. */
  const receiveMatches = useMemo(() => {
    const q = receiveQuery.trim().toUpperCase();
    if (q.length < 2) return [];
    const ready = catalog.filter((item) => item.dataQuality === "ready");
    const bySku = ready.filter((item) => item.sku.toUpperCase().includes(q));
    if (bySku.length > 0) return bySku.slice(0, 6);
    return ready
      .filter((item) =>
        item.model.toUpperCase().includes(q)
        || item.modelAliases.some((alias) => alias.toUpperCase().includes(q)))
      .slice(0, 6);
  }, [catalog, receiveQuery]);

  /**
   * Kiezen doe je op de hangmap, niet op het nummer. Hetzelfde artikelnummer
   * ligt soms in twee mappen; wie dan op een keuzeknop drukte kreeg dat nummer
   * terug in het zoekveld, waarna er wéér twee treffers waren en er niets
   * gebeurde. Het hangmapnummer is wel van elkaar te onderscheiden.
   */
  const [receiveKey, setReceiveKey] = useState<string | null>(null);
  const gekozenMap = receiveKey
    ? receiveMatches.find((item) => item.catalogKey === receiveKey)
    : undefined;
  // Past de eerdere keuze niet meer bij wat er nu staat, dan telt gewoon weer
  // de enige treffer. Zo blijft er nooit een oude keuze hangen.
  const receiveItem = gekozenMap ?? (receiveMatches.length === 1 ? receiveMatches[0] : null);

  async function addStock() {
    if (!receiveItem) {
      setReceiveMessage({ tone: "warn", text: "Kies eerst welk stickervel je hebt ontvangen." });
      return;
    }
    if (!policy.employeeCanReceive) {
      setReceiveMessage({ tone: "warn", text: "Je mag geen ontvangsten boeken. Geef het door aan je teamleider." });
      return;
    }
    try {
      const result = await onInventoryMutation({
        sku: receiveItem.stockKey,
        type: "receipt",
        quantity: receiveQuantity,
        reasonCode: "supplier_delivery",
        notes: `Ontvangen in hangmap ${receiveItem.storageNumber}`,
        reference: receiveReference.trim() || undefined,
        actor: actorName,
      });
      setReceiveMessage({
        tone: "ok",
        text: `${receiveQuantity} toegevoegd aan hangmap ${receiveItem.storageNumber}. Er liggen er nu ${result.newQuantity}.`,
      });
      setReceiveQuery("");
      setReceiveKey(null);
      setReceiveQuantity(1);
      setReceiveReference("");
      requestAnimationFrame(() => receiveInputRef.current?.focus());
    } catch (error) {
      setReceiveMessage({ tone: "warn", text: error instanceof Error ? error.message : "Toevoegen is niet gelukt." });
    }
  }

  return (
    <div className="worker">
      <div className="worker-tabs" role="tablist" aria-label="Wat wil je doen?">
        <button role="tab" aria-selected={tab === "advice"} className={tab === "advice" ? "active" : ""} onClick={() => setTab("advice")}>
          Welke sticker?
        </button>
        <button role="tab" aria-selected={tab === "receive"} className={tab === "receive" ? "active" : ""} onClick={() => setTab("receive")}>
          Stickers ontvangen
        </button>
        <button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>
          Bij Noviply
          {/* Wat je hebt aangevraagd, plus wat na de ronde nog antwoord nodig
              heeft. Laptops die nog rustig op hun ronde wachten tellen niet
              mee: daar hoeft niemand iets voor te doen. */}
          {openAtNoviply + waitGroups.due.length > 0 && (
            <span className="tab-badge">{openAtNoviply + waitGroups.due.length}</span>
          )}
        </button>
      </div>

      {printingNow(printerChecks, now) && (
        <div className="printing-now" role="status">
          <span className="printing-dot" aria-hidden="true" />
          <span>
            <strong>Noviply print op dit moment</strong>
            <small>De printer draait. Zodra een sticker klaar is, zie je dat bij “Bij Noviply”.</small>
          </span>
        </div>
      )}

      {tab === "advice" && (
        <section className="worker-panel">
          <div className="worker-fields">
            {/* De suggesties horen hier, tegen het veld waarin je typt. Ze
                stonden onder alle vier de velden, dus je typte bovenaan en het
                antwoord verscheen onder de prijsknoppen. */}
            <label className="worker-model-field">
              <span>1 · Welke laptop?</span>
              <input
                ref={modelInputRef}
                value={modelQuery}
                autoComplete="off"
                role="combobox"
                aria-expanded={pickerOpen}
                aria-controls="model-suggesties"
                onChange={(event) => { setModelQuery(event.target.value); setChosenModel(null); setAdviceMessage(null); }}
                placeholder="Typ modelnummer, bijvoorbeeld 5420"
                autoFocus
              />
              {pickerOpen && (
                <div className="model-suggestions" id="model-suggesties" role="listbox">
                  <strong>
                    {modelZoek.total > modelMatches.length
                      ? `${modelMatches.length} van de ${modelZoek.total} — typ de generatie erbij`
                      : `${modelMatches.length} modellen — welke bedoel je?`}
                  </strong>
                  {modelMatches.map((candidate) => (
                    <button
                      key={candidate.name}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className={candidate.source === "hangmap" ? "has-sheet" : ""}
                      onClick={() => { setChosenModel(candidate.name); setModelQuery(candidate.name); }}
                    >
                      <span>{candidate.name}</span>
                      {/* Ligt er een vel klaar, of komt dit op een andere
                          oplossing uit? Dat scheelt de medewerker een gang. */}
                      <small>{candidate.source === "hangmap" ? "vel in de hangmap" : "geen vel"}</small>
                    </button>
                  ))}
                </div>
              )}
              {modelMatches.length === 0 && modelQuery.trim().length > 1 && (
                <p className="model-unknown">
                  Dit model kennen we niet. Controleer het nummer op de onderkant
                  van de laptop, of vraag je teamleider.
                </p>
              )}
            </label>

            <label>
              <span>2 · Welke taal moet erop?</span>
              <select value={targetLayout} onChange={(event) => { setTargetLayout(event.target.value); setConfirmed(false); }}>
                {targetLayoutOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <fieldset className="worker-variants">
              <legend>
                3 · Welke Enter-toets zit erop?
                <button
                  type="button"
                  className="worker-help"
                  onClick={() => setShapeHelpOpen(true)}
                  aria-label="Voorbeeldfoto's van de Enter-vormen bekijken"
                >
                  i
                </button>
              </legend>
              <div>
                {enterShapeChoices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={choice.id === enterShape ? "active" : ""}
                    onClick={() => { setEnterShape(choice.id); setConfirmed(false); }}
                  >
                    {choice.id !== "" && <EnterShapeGlyph shape={choice.id} />}
                    <strong>{choice.label}</strong>
                    <small>{choice.detail}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Zit de gevraagde taal er al op, dan is de laptop hier klaar en
                hoeft de prijs niet eens ingevuld te worden. De taal staat in de
                knop, zodat je bevestigt wát er al goed is in plaats van alleen
                "het is goed". */}
            {model !== "" && (
              <div className="already-correct">
                <button type="button" onClick={alreadyCorrect}>
                  Het toetsenbord is al {targetLayout} — geen sticker nodig
                </button>
              </div>
            )}

            <fieldset className="worker-bands">
              <legend>4 · Wat kost de laptop?</legend>
              <div>
                {saleValueBands.map((band) => (
                  <button
                    key={band.id}
                    type="button"
                    className={band.id === saleBandId ? "active" : ""}
                    onClick={() => { setSaleBandId(band.id); setConfirmed(false); }}
                  >
                    {band.shortLabel}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {shapeHelpOpen && (
            <div
              className="shape-help"
              role="dialog"
              aria-modal="true"
              aria-label="Voorbeelden van de Enter-vormen"
              onClick={(event) => {
                if (event.target === event.currentTarget) setShapeHelpOpen(false);
              }}
            >
              <div className="shape-help-panel">
                <div className="shape-help-head">
                  <h3>Welke Enter-toets zit erop?</h3>
                  <button type="button" onClick={() => setShapeHelpOpen(false)} aria-label="Sluiten">×</button>
                </div>
                <div className="shape-help-grid">
                  {enterShapeChoices.filter((choice) => choice.image).map((choice) => (
                    <figure key={choice.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={choice.image} alt={`Toetsenbord met ${choice.label}-entervorm`} />
                      <figcaption>
                        <strong>{choice.label}</strong>
                        <span>{choice.detail}</span>
                      </figcaption>
                      <button
                        type="button"
                        className={choice.id === enterShape ? "primary-button" : "secondary-button"}
                        onClick={() => {
                          setEnterShape(choice.id);
                          setConfirmed(false);
                          setShapeHelpOpen(false);
                        }}
                      >
                        Dit is het
                      </button>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* De bevestiging moet blijven staan nadat het model is leeggemaakt,
              anders verdwijnt met de laptop ook het bewijs dat het gelukt is. */}
          {!hasAnswer && adviceMessage && (
            <p className={adviceMessage.tone === "ok" ? "answer-done standalone" : "answer-warning standalone"}>
              {adviceMessage.text}
            </p>
          )}

          {!hasAnswer && (
            <div className="worker-waiting">
              <span>
                {pickerOpen
                  ? "Kies hierboven welk model je bedoelt."
                  : "Typ hierboven het modelnummer. Het antwoord verschijnt vanzelf."}
              </span>
            </div>
          )}

          {hasAnswer && (
            <div className={`answer tone-${methodProfile(effectiveMethod).tone}${usesSheet ? "" : " answer-nosheet"}`}>
              <div className="answer-head">
                <div>
                  <span>DIT MOET JE GEBRUIKEN</span>
                  <h2 className={`method-name tone-${methodProfile(effectiveMethod).tone}`}>
                    <span className="method-dot" aria-hidden="true" />
                    {methodLabel(effectiveMethod)}
                  </h2>
                  {/* De toelichting op de methode is weggelaten: die legt uit
                      wát het is, en dat weet de werkvloer al. Wat blijft is
                      welke laptop en welke taal — waar je op kunt nakijken of
                      je de juiste laptop in je handen hebt. */}
                  <p className="method-tier">
                    <span className="method-stars" aria-hidden="true">
                      {methodStars(effectiveMethod)}
                    </span>
                    <span className="sr-only">
                      Niveau {methodProfile(effectiveMethod).tier} van 4.
                    </span>
                    {model} · {matched ? layoutWithCountry(matched.item.layout, matched.item.sku) : targetLayout}
                  </p>
                  {methodProfile(effectiveMethod).supplier && (
                    <p className="method-supplier">
                      <span>Leverancier</span>
                      <b>{methodProfile(effectiveMethod).supplier}</b>
                    </p>
                  )}
                </div>
                {usesSheet && storageNumber !== null && (
                  <div className="answer-slot">
                    <span>HANGMAP</span>
                    <strong>{storageNumber}</strong>
                  </div>
                )}
              </div>

              {usesSheet && matched && (
                <>
                  <dl className="answer-facts">
                    <div><dt>Stickervel</dt><dd>{matched.item.sku}</dd></div>
                    <div><dt>Entervorm</dt><dd>{matched.variant}</dd></div>
                    <div><dt>Nog op voorraad</dt><dd>{quantities[matched.item.catalogKey] ?? matched.item.stock}</dd></div>
                  </dl>
                  {/* Hetzelfde vel ligt vaak in meer dan één map. Staat de
                      aangewezen map onverwacht leeg, dan hoeft niemand te gaan
                      zoeken of iets aan te vragen wat er gewoon ligt. */}
                  {matched.alternatives.length > 0 && (
                    <p className="answer-alternatives">
                      Past ook: hangmap {matched.alternatives.map((item) => item.storageNumber).join(", ")}
                    </p>
                  )}
                </>
              )}

              {noviplyBlock && (
                <div className="answer-fallback">
                  <b>{unavailableReasonLabel(noviplyBlock.reason)}</b>
                  <p>
                    Dat hebben ze gemeld op {new Date(noviplyBlock.recordedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}
                    {noviplyBlock.note ? `: “${noviplyBlock.note}”` : ""}. Aanvragen heeft dus geen zin;
                    hierboven staat wat er wél kan.
                  </p>
                </div>
              )}

              {fallbackToPremium && (
                <div className="answer-fallback">
                  <b>
                    {printBlocked
                      ? "Je hebt gemeld dat de toetsenbordsprint niet gaat"
                      : `De toetsenbordsprinter kan ${targetLayout} niet voor dit model`}
                  </b>
                  <p>Hij gaat met een premiumsticker; die moet Noviply printen.</p>
                  {printScope.layouts.length > 0 && (
                    <p className="fallback-detail">
                      Voor dit model kunnen zij wel: {printScope.layouts.join(", ")}.
                    </p>
                  )}
                </div>
              )}

              {/* Eerst invullen, dan pas de knoppen. Andersom liep je vast: je
                  klikte op "moet nog geprint", de app sprong naar het lege
                  ordernummerveld, en na het invullen moest je diezelfde knop
                  nog een keer aanklikken. Alles wat een knop nodig heeft staat
                  nu erboven, in leesvolgorde. */}
              <div className="answer-input-row">
                <label className={`answer-order${orderMissing ? " needs" : ""}`}>
                  {/* Alleen bij een aanvraag moet Noviply weten om welke order
                      het gaat. Bij een vel uit de kast hoeft het niet, en dan
                      hoort er ook niet te staan dat het moet. */}
                  <span>
                    Ordernummer
                    <em>{effectiveMethod === "printed_sticker" ? "nodig voor de aanvraag" : "mag leeg"}</em>
                  </span>
                  <input
                    ref={orderInputRef}
                    value={orderReference}
                    inputMode="numeric"
                    onChange={(event) => { setOrderReference(event.target.value); setOrderMissing(false); }}
                    placeholder="1859"
                  />
                  {orderMissing && <b>Vul dit in — Noviply weet anders niet welke order dit is</b>}
                </label>

                {/* Eén order kan meerdere laptops zijn. Bijna altijd één, dus
                    daar hoeft niemand iets voor te doen — maar staan er drie
                    dezelfde op de kar, dan is dit één handeling in plaats van
                    drie, en weet Noviply dat het om drie vellen gaat. */}
                {(usesSheet || effectiveMethod === "printed_sticker") && (
                  <div className="answer-quantity">
                    <span>Aantal laptops</span>
                    <div className="quantity-stepper">
                      <button
                        type="button"
                        aria-label="Eén minder"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={quantity}
                        aria-label="Aantal laptops"
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          setQuantity(Number.isFinite(value) ? Math.min(200, Math.max(1, Math.round(value))) : 1);
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Eén meer"
                        disabled={quantity >= 200}
                        onClick={() => setQuantity((value) => Math.min(200, value + 1))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Noviply krijgt de laptop niet te zien. Het trackpoint verandert
                  de indeling van het toetsenbord, dus zonder dit antwoord kunnen
                  ze het verkeerde vel maken. */}
              {effectiveMethod === "printed_sticker" && (fallbackToPremium || askingSlipDate) && (
                <fieldset className={`trackpoint-ask${trackpointMissing ? " missing" : ""}`}>
                  <legend>Zit er een klein rond knopje tussen de G, H en B?</legend>
                  <div className="trackpoint-choice">
                    {([["yes", "Ja"], ["no", "Nee"]] as const).map(([waarde, label]) => (
                      <button
                        key={waarde}
                        type="button"
                        className={trackpoint === waarde ? "chosen" : ""}
                        aria-pressed={trackpoint === waarde}
                        onClick={() => { setTrackpoint(waarde); setTrackpointMissing(false); }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {trackpointMissing && <small>Kies eerst ja of nee.</small>}
                </fieldset>
              )}

              {effectiveMethod === "printed_sticker" ? (
                <div className="answer-todo">
                  {/* De toetsenbordsprinter kan dit model niet; de rondes van
                      Noviply kennen hem dus ook niet. Dan is de pakbondatum
                      niet interessant en moet er gewoon aangevraagd worden. */}
                  {fallbackToPremium ? (
                    <>
                      <b>Deze sticker ligt niet voorgeprint klaar</b>
                      <div className="print-ready-choice">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => requestFromNoviply("Keyboard printer cannot handle this model.")}
                        >
                          Aanvragen bij Noviply
                        </button>
                      </div>
                    </>
                  ) : askingSlipDate ? (
                    <>
                      <b>Is deze order vandaag besteld? Kijk de datum op de pakbon.</b>
                      {!nextRun && (
                        <p>Beide printrondes van vandaag zijn geweest.</p>
                      )}
                      <div className="print-ready-choice">
                        {nextRun && (
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => void waitForRun(nextRun)}
                          >
                            Ja, vandaag besteld — zet hem apart, de sticker komt om {nextRun.label} mee
                          </button>
                        )}
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => requestFromNoviply(nextRun
                            ? "Packing slip from an earlier day; was not in the run."
                            : "Both runs for today had already gone.")}
                        >
                          {nextRun
                            ? "Nee, eerdere datum — nu aanvragen bij Noviply"
                            : "Aanvragen bij Noviply"}
                        </button>
                        <button
                          type="button"
                          className="answer-escape"
                          onClick={() => setAskingSlipDate(false)}
                        >
                          Terug
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <b>Kijk in de stapel voorgeprinte stickers. Ligt deze order erbij?</b>
                      <div className="print-ready-choice">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => setAdviceMessage({
                            tone: "ok",
                            text: "Pak de voorgeprinte sticker uit de klaargelegde stapel en breng hem in één keer aan.",
                          })}
                        >
                          Ja, ligt erbij
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            /*
                             * Geen controle op het ordernummer hier. Deze knop
                             * verstuurt niets — hij laat alleen de volgende
                             * vraag zien. Blokkeren betekende: klik, sprong
                             * naar het lege veld, invullen, en dan dezelfde
                             * knop nóg een keer. De controle staat waar hij
                             * hoort: op de knoppen die het echt naar Noviply
                             * sturen.
                             */
                            setAdviceMessage(null);
                            setAskingSlipDate(true);
                          }}
                        >
                          Nee, ligt er niet
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="answer-todo">
                  <b>Wat moet je doen</b>
                  <p>{todoFor(effectiveMethod, storageNumber)}</p>
                  {/* De koppeling met Roemenië is niet sluitend: zij noemen
                      sommige modellen bij hun interne nummer. Dan moet de
                      medewerker kunnen zeggen dat het niet gaat. */}
                  {effectiveMethod === "direct_reprint" && printScope.status !== "supported" && (
                    <button
                      type="button"
                      className="answer-escape"
                      onClick={() => setPrintBlocked(true)}
                    >
                      Lukt niet — dit model kan niet door de toetsenbordsprinter
                    </button>
                  )}
                </div>
              )}

              {noviplyMatch.status === "out_of_stock" && (
                <p className="answer-warning">Dit vel is op. Meld het bij je teamleider en gebruik zolang een andere methode.</p>
              )}
              {noviplyMatch.status === "other_variant" && (
                <p className="answer-warning">
                  Voor dit model ligt geen {enterShape}-vel in de hangmappen, alleen{" "}
                  {noviplyMatch.availableVariants.join(" en ")}. Controleer de Enter-toets nog
                  eens, of vraag je teamleider.
                </p>
              )}
              {evidence?.status === "rejected" && (
                <p className="answer-warning">Dit vel is eerder afgekeurd voor dit model. Gebruik het niet.</p>
              )}

              {adviceMessage && (
                <p className={adviceMessage.tone === "ok" ? "answer-done" : "answer-warning"}>{adviceMessage.text}</p>
              )}

              {/* Dit zijn de twee dingen die de medewerker zelf invult, dus
                  staan ze groot en vooraan. Ze stonden in kleine letters naast
                  een aanvinkvakje, en juist daar ging het mis: een aanvraag
                  zonder ordernummer liep op een foutmelding stuk. */}
              {/* Tijdens de pakbonvraag zijn die twee knoppen de handeling. Een
                  vinkje en een "Klaar" eronder is dan niet alleen ruis: je kunt
                  hem afmelden zonder ooit iets aan te vragen. */}
              {!askingSlipDate && (
              <label className={`answer-confirm${confirmed ? " on" : ""}`}>
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                <span>
                  {usesSheet && matched
                    ? `Vel uit hangmap ${storageNumber} klopt: ${matched.item.sku} · ${matched.variant}`
                    : "Ik heb dit gedaan"}
                </span>
              </label>
              )}

              {!askingSlipDate && (
              <div className="answer-actions">
                <button className="primary-button" disabled={!confirmed} onClick={bookDone}>
                  {usesSheet
                    ? (quantity === 1 ? "Vel afboeken" : `${quantity} vellen afboeken`)
                    : "Klaar"}
                </button>
                {usesSheet && matched && (
                  <button className="danger-ghost-button" onClick={() => setIssueOpen((open) => !open)}>
                    Past niet
                  </button>
                )}
                <button className="secondary-button" onClick={() => resetAdvice()}>Volgende laptop</button>
              </div>
              )}

              {issueOpen && matched && (
                <div className="answer-issue">
                  <label>
                    <span>Wat klopt er niet?</span>
                    <select value={failureReason} onChange={(event) => setFailureReason(event.target.value as StickerVerificationFailureReason)}>
                      {failureOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <button className="secondary-button" onClick={() => reportIssue(false)}>Vel is nog goed, terugleggen</button>
                    <button className="danger-ghost-button" onClick={() => reportIssue(true)}>Vel is verbruikt of stuk</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "requests" && (
        <section className="worker-panel">
          <div className="requests-head">
            <p className="requests-headline">{printRequestHeadline(requestGroups)}</p>
            {printRequests.length > 4 && (
              <label className="requests-search">
                <span className="sr-only">Zoeken in aanvragen</span>
                <input
                  type="search"
                  value={requestZoek}
                  onChange={(event) => setRequestZoek(event.target.value)}
                  placeholder="Zoek op ordernummer of model"
                />
              </label>
            )}
          </div>

          {/* De ronde is geweest; nu moet iemand zeggen of het vel er lag.
              Bovenaan, want hier staat een laptop op te wachten. */}
          {waitGroups.due.length > 0 && (
            <div className="request-group due">
              <h3>De printronde is geweest — ligt het vel erbij?</h3>
              {waitGroups.due.map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.model}</strong>
                    <span>{entry.layout}{entry.variant && ` · ${entry.variant}`}</span>
                  </div>
                  <div className="request-order">
                    <b>{entry.orderReference}</b>
                    {/* Stond hij in de ingelezen ronde, dan hoort het vel er te
                        liggen. Dat maakt de vraag makkelijker te beantwoorden. */}
                    {(() => {
                      const inRonde = batchRowForOrder(printBatches, entry.orderReference);
                      return inRonde
                        ? <small className="in-batch">stond in {batchLabel(inRonde.batch)}</small>
                        : <small>ronde van {entry.expectedRunLabel}</small>;
                    })()}
                  </div>
                  <div className="request-settle">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => onSettleRunWait(entry.id, "collected")}
                    >
                      Ja, opgehaald
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onSettleRunWait(entry.id, "escalated")}
                    >
                      Nee, toch aanvragen
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {waitGroups.pending.length > 0 && (
            <div className="request-group waiting">
              <h3>Staat apart voor de volgende printronde</h3>
              {waitGroups.pending.map((entry) => (
                <article key={entry.id}>
                  <div>
                    <strong>{entry.model}</strong>
                    <span>{entry.layout}{entry.variant && ` · ${entry.variant}`}</span>
                  </div>
                  <div className="request-order">
                    <b>{entry.orderReference}</b>
                    {/* Staat de order in een ingelezen ronde, dan is bevestigd
                        dat het vel eraan komt. Dat was eerst twee lijsten met
                        de hand naast elkaar leggen. */}
                    {(() => {
                      const inRonde = batchRowForOrder(printBatches, entry.orderReference);
                      return inRonde
                        ? <small className="in-batch">staat in {batchLabel(inRonde.batch)}</small>
                        : <small>komt mee om {entry.expectedRunLabel}</small>;
                    })()}
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Er staat werk klaar bij Noviply. Eén seintje is genoeg; zolang er
              een openstaat blijft de knop weg, anders gaat het rinkelen. */}
          {requestGroups.waiting.length > 0 && (
            <div className={`remind-noviply${tooLong ? " urgent" : ""}`}>
              <div>
                <strong>
                  {tooLong
                    ? "Dit staat al een tijdje open"
                    : requestGroups.waiting.length === 1
                      ? "Eén sticker staat klaar om te printen"
                      : `${requestGroups.waiting.length} stickers staan klaar om te printen`}
                </strong>
                <span>
                  Noviply print &apos;s ochtends en &apos;s middags. Kan het eerder, laat het
                  ze weten — ze krijgen het meteen in beeld.
                </span>
              </div>
              <button type="button" className="primary-button" onClick={onRemindNoviply}>
                Noviply een seintje geven
              </button>
            </div>
          )}

          {/* Wachten staat bovenaan: dat is wat er nog moet gebeuren. Daarna wat
              niet gaat, en pas onderaan wat al klaarligt — dat is af. */}
          {zichtbaar.waiting.length > 0 && (
            <div className="request-group waiting">
              <h3>Wacht nog bij Noviply<b>{zichtbaar.waiting.length}</b></h3>
              {zichtbaar.waiting.map((request) => (
                <article key={request.id}>
                  <div>
                    <strong>{request.model}</strong>
                    <span>{request.layout}{request.variant && ` · ${request.variant}`}</span>
                  </div>
                  <div className="request-order">
                    <b>{request.orderReference || "geen ordernummer"}</b>
                    <small>aangevraagd</small>
                  </div>
                </article>
              ))}
            </div>
          )}

          {zichtbaar.blocked.length > 0 && (
            <div className="request-group blocked">
              <h3>Kan niet geprint worden<b>{zichtbaar.blocked.length}</b></h3>
              {zichtbaar.blocked.map((request) => (
                <article key={request.id} className={isFresh(request, now) ? "fresh" : ""}>
                  <div>
                    <strong>{request.model}</strong>
                    <span>{request.layout}{request.variant && ` · ${request.variant}`}</span>
                  </div>
                  <div className="request-order">
                    <b>{request.orderReference || "geen ordernummer"}</b>
                    {/* Zonder de reden weet niemand wat er dan wél moet gebeuren. */}
                    <small>{request.note || "geen reden opgegeven"}</small>
                  </div>
                </article>
              ))}
            </div>
          )}

          {zichtbaar.ready.length > 0 && (
            <div className="request-group ready">
              <h3>Klaar om op te halen<b>{zichtbaar.ready.length}</b></h3>
              {zichtbaar.ready.map((request) => (
                <article key={request.id} className={isFresh(request, now) ? "fresh" : ""}>
                  <div>
                    <strong>{request.model}</strong>
                    <span>{request.layout}{request.variant && ` · ${request.variant}`}</span>
                  </div>
                  <div className="request-order">
                    <b>{request.orderReference || "geen ordernummer"}</b>
                    <small>geprint door {request.handledBy}</small>
                  </div>
                </article>
              ))}
            </div>
          )}

          {requestZoek.trim() !== "" && zichtbaar.waiting.length + zichtbaar.blocked.length + zichtbaar.ready.length === 0 && (
            <p className="requests-empty">Niets gevonden voor “{requestZoek.trim()}”.</p>
          )}

          {printRequests.length === 0 && (
            <p className="requests-empty">
              Zodra je een sticker bij Noviply aanvraagt, kun je hier volgen wat ermee
              gebeurt.
            </p>
          )}
        </section>
      )}

      {tab === "receive" && (
        <section className="worker-panel">
          <div className="worker-fields receive">
            <label className="wide">
              <span>Welke stickers heb je ontvangen?</span>
              <input
                ref={receiveInputRef}
                value={receiveQuery}
                onChange={(event) => { setReceiveQuery(event.target.value); setReceiveMessage(null); }}
                placeholder="Scan of typ het stickernummer of het laptopmodel"
                autoFocus
              />
            </label>
            <label>
              <span>Hoeveel?</span>
              <input
                type="number"
                min={1}
                value={receiveQuantity}
                onChange={(event) => setReceiveQuantity(Math.max(1, Number(event.target.value)))}
              />
            </label>
            <label>
              <span>Pakbon (mag leeg)</span>
              <input value={receiveReference} onChange={(event) => setReceiveReference(event.target.value)} placeholder="NOV-24817" />
            </label>
          </div>

          {receiveQuery.trim().length < 2 && (
            <div className="worker-waiting">
              <span>Typ of scan het stickernummer of het laptopmodel. KeyFlow zoekt zelf de juiste hangmap erbij.</span>
            </div>
          )}

          {receiveQuery.trim().length >= 2 && receiveMatches.length === 0 && (
            <div className="worker-waiting">
              <strong>Niets gevonden.</strong>
              <span>Controleer het nummer op de verpakking, of vraag je teamleider.</span>
            </div>
          )}

          {receiveMatches.length > 1 && !receiveItem && (
            <div className="worker-waiting">
              <strong>Welke bedoel je?</strong>
              <div className="worker-choices">
                {receiveMatches.map((item) => (
                  <button key={item.catalogKey} onClick={() => setReceiveKey(item.catalogKey)}>
                    {item.sku} · hangmap {item.storageNumber} · {item.model}
                  </button>
                ))}
              </div>
            </div>
          )}

          {receiveItem && (
            <div className="answer">
              <div className="answer-head">
                <div>
                  <span>LEG ZE HIER NEER</span>
                  <h2>{receiveItem.model}</h2>
                  <p>{receiveItem.sku} · {layoutWithCountry(receiveItem.layout, receiveItem.sku)}</p>
                </div>
                <div className="answer-slot">
                  <span>HANGMAP</span>
                  <strong>{receiveItem.storageNumber}</strong>
                </div>
              </div>

              <dl className="answer-facts">
                <div><dt>Nu op voorraad</dt><dd>{quantities[receiveItem.catalogKey] ?? receiveItem.stock}</dd></div>
                <div><dt>Je voegt toe</dt><dd>+{receiveQuantity}</dd></div>
                <div><dt>Straks</dt><dd>{(quantities[receiveItem.catalogKey] ?? receiveItem.stock) + receiveQuantity}</dd></div>
              </dl>

              <div className="answer-todo">
                <b>Wat moet je doen</b>
                <p>
                  Leg {receiveQuantity === 1 ? "het vel" : `de ${receiveQuantity} vellen`} in
                  hangmap {receiveItem.storageNumber} en druk daarna op toevoegen.
                </p>
              </div>

              {receiveMessage && (
                <p className={receiveMessage.tone === "ok" ? "answer-done" : "answer-warning"}>{receiveMessage.text}</p>
              )}

              <div className="answer-actions">
                <button className="primary-button" onClick={addStock}>Toevoegen aan voorraad</button>
              </div>
            </div>
          )}

          {!receiveItem && receiveMessage && (
            <p className={receiveMessage.tone === "ok" ? "answer-done" : "answer-warning"}>{receiveMessage.text}</p>
          )}
        </section>
      )}
    </div>
  );
}
