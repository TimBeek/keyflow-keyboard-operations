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
  resolveModelQuery,
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
import type { PrintRequestInput } from "@/domain/print-requests";
import type { ConversionLogInput } from "@/domain/conversion-log";

/**
 * Eén concrete handeling per methode. Bewust geen lijst met werkinstructies:
 * de medewerker moet weten wát hij doet, niet dát er instructies bestaan.
 */
function todoFor(method: ConversionMethodId, storageNumber: number | null): string {
  switch (method) {
    case "noviply_sheet":
      return storageNumber === null
        ? "Pak het voorraadvel, leg het eerst los op het toetsenbord en breng het daarna in één beweging aan."
        : `Pak het vel uit hangmap ${storageNumber}, leg het eerst los op het toetsenbord om te kijken of het past, en breng het daarna in één beweging aan.`;
    case "printed_sticker":
      return "Laat een sterke printsticker printen voor dit model en breng die in één keer goed aan — herpositioneren kan niet.";
    case "direct_reprint":
      return "Zet deze laptop in de wachtrij voor de keyboardprinter. Je hoeft zelf geen vel te pakken.";
    case "loose_stickers":
      return "Alleen met toestemming van je teamleider: plak de losse stickers toets voor toets.";
    case "none":
    default:
      return "Geen conversie nodig. Zet de laptop door naar de volgende stap.";
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

type Tab = "advice" | "receive";

/**
 * De Enter-toets verraadt de entervorm, en die bepaalt uit welke hangmap het vel
 * komt. "Weet ik niet" blijft mogelijk: dan zoekt KeyFlow gewoon op model.
 */
type EnterShapeId = "" | "E1" | "E2";

/** Bestanden uit /public krijgen het basispad van een projectsite niet vanzelf. */
const assetBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const enterShapeChoices: { id: EnterShapeId; label: string; detail: string; image?: string }[] = [
  {
    id: "E1",
    label: "E1",
    detail: "Rechthoekige Enter",
    image: `${assetBase}/keyboard-reference-e1-dell-v3.png`,
  },
  {
    id: "E2",
    label: "E2",
    detail: "Hoge, omgekeerde L",
    image: `${assetBase}/keyboard-reference-e2-dell-v3.png`,
  },
  { id: "", label: "Weet ik niet", detail: "Zoek alleen op model" },
];

type Props = {
  catalog: InventoryCatalogItem[];
  actorName: string;
  orders: WorkOrderSnapshot[];
  quantities: Record<string, number>;
  policy: OperationsPolicy;
  compatibilityEvidenceRecords: CompatibilityEvidenceRecord[];
  onInventoryMutation: (request: InventoryMutationRequest) => Promise<InventoryMutationOutcome>;
  onStickerVerification: (input: StickerVerificationReportInput) => unknown;
  onRequestPrintSticker: (input: PrintRequestInput) => unknown;
  onRecordConversion: (input: ConversionLogInput) => unknown;
};

export function EmployeeWorkspace({
  catalog,
  actorName,
  quantities,
  policy,
  compatibilityEvidenceRecords,
  onInventoryMutation,
  onStickerVerification,
  onRequestPrintSticker,
  onRecordConversion,
}: Props) {
  const [tab, setTab] = useState<Tab>("advice");

  /* ---------- tabblad 1: welke sticker? ---------- */
  const modelInputRef = useRef<HTMLInputElement>(null);
  const orderInputRef = useRef<HTMLInputElement>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [targetLayout, setTargetLayout] = useState("QWERTY US");
  const [saleBandId, setSaleBandId] = useState<SaleValueBandId>("200_299");
  const [enterShape, setEnterShape] = useState<EnterShapeId>("");
  const [shapeHelpOpen, setShapeHelpOpen] = useState(false);
  const [orderReference, setOrderReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [adviceMessage, setAdviceMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [failureReason, setFailureReason] = useState<StickerVerificationFailureReason>("position_mismatch");

  const modelOptions = useMemo(() => catalogModelOptions(catalog), [catalog]);
  const resolution = useMemo(
    () => resolveModelQuery(modelQuery, modelOptions),
    [modelOptions, modelQuery],
  );
  const model = chosenModel ?? (resolution.status === "unique" ? resolution.model : "");

  const saleBand = getSaleValueBand(saleBandId);
  const saleValue = policyValueForBand(saleBand, policy.thresholdEur);

  const noviplyMatch = useMemo(
    () => findNoviplySku(model, targetLayout, catalog, quantities, enterShape),
    [catalog, enterShape, model, quantities, targetLayout],
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

  const recommendation = useMemo(() => recommendConversion({
    saleValueEur: saleValue,
    saleValueLabel: saleBand.label,
    thresholdEur: policy.thresholdEur,
    currentLayout: assumedCurrentLayout,
    targetLayout,
    workload: policy.workload,
    available: policy.methodEnabled,
    compatible: {
      loose_stickers: true,
      noviply_sheet: noviplyMatch.status === "matched" && evidence?.status !== "rejected",
      printed_sticker: true,
      direct_reprint: true,
    },
  }), [assumedCurrentLayout, evidence?.status, noviplyMatch.status, policy, saleBand.label, saleValue, targetLayout]);

  const hasAnswer = model !== "";
  const usesSheet = recommendation.primary === "noviply_sheet";
  const storageNumber = matched?.item.storageNumber ?? null;

  function resetAdvice() {
    setModelQuery("");
    setChosenModel(null);
    setOrderReference("");
    setConfirmed(false);
    setAdviceMessage(null);
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

  async function bookDone() {
    if (!usesSheet) {
      // Ook zonder voorraadvel is de laptop klaar: leegmaken voor de volgende,
      // anders blijft hij op het scherm staan en weet niemand of het gelukt is.
      // "Geen conversie" is geen conversie: die hoort niet in de telling.
      if (recommendation.primary !== "none") {
        logConversion({
          method: recommendation.primary,
          status: "completed",
          model,
          targetLayout,
          variant: enterShape,
          orderReference,
        });
      }
      setAdviceMessage({ tone: "ok", text: "Klaar. Deze methode gebruikt geen voorraadvel, er is niets afgeboekt. Pak de volgende laptop." });
      setConfirmed(false);
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
        sku: matched.item.sku,
        type: "issue",
        quantity: 1,
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
          sku: matched.item.sku,
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

  const receiveItem = receiveMatches.length === 1 ? receiveMatches[0] : null;

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
        sku: receiveItem.sku,
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
      </div>

      {tab === "advice" && (
        <section className="worker-panel">
          <div className="worker-fields">
            <label>
              <span>1 · Welke laptop?</span>
              <input
                ref={modelInputRef}
                list="worker-models"
                value={modelQuery}
                onChange={(event) => { setModelQuery(event.target.value); setChosenModel(null); setAdviceMessage(null); }}
                placeholder="Typ modelnummer, bijvoorbeeld 5420"
                autoFocus
              />
              <datalist id="worker-models">
                {modelOptions.map((option) => <option key={option} value={option} />)}
              </datalist>
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
                    <strong>{choice.label}</strong>
                    <small>{choice.detail}</small>
                  </button>
                ))}
              </div>
            </fieldset>

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
              {resolution.status === "multiple" ? (
                <>
                  <strong>Welke bedoel je?</strong>
                  <div className="worker-choices">
                    {resolution.matches.map((candidate) => (
                      <button key={candidate} onClick={() => { setChosenModel(candidate); setModelQuery(candidate); }}>
                        {candidate}
                      </button>
                    ))}
                  </div>
                </>
              ) : resolution.status === "none" && modelQuery.trim().length > 1 ? (
                <>
                  <strong>Dit model kennen we niet.</strong>
                  <span>Controleer het nummer op de onderkant van de laptop, of vraag je teamleider.</span>
                </>
              ) : (
                <span>Typ hierboven het modelnummer. Het antwoord verschijnt vanzelf.</span>
              )}
            </div>
          )}

          {hasAnswer && (
            <div className={`answer tone-${methodProfile(recommendation.primary).tone}${usesSheet ? "" : " answer-nosheet"}`}>
              <div className="answer-head">
                <div>
                  <span>DIT MOET JE GEBRUIKEN</span>
                  <h2 className={`method-name tone-${methodProfile(recommendation.primary).tone}`}>
                    <span className="method-dot" aria-hidden="true" />
                    {methodLabel(recommendation.primary)}
                  </h2>
                  <p className="method-tier">
                    <span className="method-stars" aria-hidden="true">
                      {methodStars(recommendation.primary)}
                    </span>
                    <span className="sr-only">
                      Niveau {methodProfile(recommendation.primary).tier} van 4.
                    </span>
                    {methodProfile(recommendation.primary).note}
                  </p>
                  <p>
                    {model} · {matched ? layoutWithCountry(matched.item.layout, matched.item.sku) : targetLayout}
                    {methodProfile(recommendation.primary).supplier
                      && ` · via ${methodProfile(recommendation.primary).supplier}`}
                  </p>
                </div>
                {usesSheet && storageNumber !== null && (
                  <div className="answer-slot">
                    <span>HANGMAP</span>
                    <strong>{storageNumber}</strong>
                  </div>
                )}
              </div>

              {usesSheet && matched && (
                <dl className="answer-facts">
                  <div><dt>Stickervel</dt><dd>{matched.item.sku}</dd></div>
                  <div><dt>Entervorm</dt><dd>{matched.variant}</dd></div>
                  <div><dt>Nog op voorraad</dt><dd>{quantities[matched.item.catalogKey] ?? matched.item.stock}</dd></div>
                </dl>
              )}

              {recommendation.primary === "printed_sticker" ? (
                <div className="answer-todo">
                  <b>Ligt deze sticker al klaar?</b>
                  <p>
                    De buitenlandse orders worden &apos;s ochtends automatisch voorgeprint.
                  </p>
                  <div className="print-ready-choice">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setAdviceMessage({
                        tone: "ok",
                        text: "Pak de voorgeprinte sticker uit de klaargelegde stapel en breng hem in één keer aan.",
                      })}
                    >
                      Ja, ligt klaar
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        // Noviply kan zonder ordernummer niet zien om welke
                        // order het gaat, dus hier is het wél verplicht.
                        if (!orderReference.trim()) {
                          setAdviceMessage({
                            tone: "warn",
                            text: "Vul eerst het ordernummer in — zonder dat weet Noviply niet welke order dit is.",
                          });
                          requestAnimationFrame(() => orderInputRef.current?.focus());
                          return;
                        }
                        try {
                          onRequestPrintSticker({
                            model,
                            layout: matched
                              ? layoutWithCountry(matched.item.layout, matched.item.sku)
                              : targetLayout,
                            variant: enterShape,
                            orderReference,
                            reason: "Not ready during the morning run.",
                          });
                          // De laptop is voor de medewerker klaar, maar pas af
                          // als Noviply hem geprint heeft. Dat verschil blijft
                          // zichtbaar in de rapportage.
                          logConversion({
                            method: "printed_sticker",
                            status: "awaiting_print",
                            model,
                            targetLayout,
                            variant: enterShape,
                            orderReference,
                          });
                          setAdviceMessage({
                            tone: "ok",
                            text: `Aangevraagd bij Noviply voor order ${orderReference.trim()}. Zet deze laptop apart en wacht tot Noviply hem geprint heeft — voor jou is deze sticker klaar.`,
                          });
                          setConfirmed(false);
                          setModelQuery("");
                          setChosenModel(null);
                          setOrderReference("");
                          requestAnimationFrame(() => modelInputRef.current?.focus());
                        } catch (error) {
                          setAdviceMessage({
                            tone: "warn",
                            text: error instanceof Error ? error.message : "Aanvragen is niet gelukt.",
                          });
                        }
                      }}
                    >
                      Nee, aanvragen
                    </button>
                  </div>
                </div>
              ) : (
                <div className="answer-todo">
                  <b>Wat moet je doen</b>
                  <p>{todoFor(recommendation.primary, storageNumber)}</p>
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

              <div className="answer-finish">
                <label className="answer-confirm">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  <span>
                    {usesSheet && matched
                      ? `Het vel uit hangmap ${storageNumber} klopt met ${matched.item.sku} en ${matched.variant}.`
                      : "Ik heb dit uitgevoerd."}
                  </span>
                </label>
                <label className="answer-order">
                  <span>Ordernummer (mag leeg)</span>
                  <input ref={orderInputRef} value={orderReference} onChange={(event) => setOrderReference(event.target.value)} placeholder="1859" />
                </label>
              </div>

              <div className="answer-actions">
                <button className="primary-button" disabled={!confirmed} onClick={bookDone}>
                  Gedaan{usesSheet ? " — boek vel af" : ""}
                </button>
                {usesSheet && matched && (
                  <button className="danger-ghost-button" onClick={() => setIssueOpen((open) => !open)}>
                    Past niet
                  </button>
                )}
                <button className="secondary-button" onClick={resetAdvice}>Volgende laptop</button>
              </div>

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

          {receiveMatches.length > 1 && (
            <div className="worker-waiting">
              <strong>Welke bedoel je?</strong>
              <div className="worker-choices">
                {receiveMatches.map((item) => (
                  <button key={item.catalogKey} onClick={() => setReceiveQuery(item.sku)}>
                    {item.sku} · {item.model}
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
