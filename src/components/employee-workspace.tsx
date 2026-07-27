"use client";

import { useMemo, useRef, useState } from "react";
import type { InventoryCatalogItem } from "@/data/inventory-demo";
import {
  lookupWorkOrder,
  type WorkOrderSnapshot,
} from "@/domain/order-lookup";
import {
  methodLabel,
  recommendConversion,
  type ConversionMethodId,
} from "@/domain/conversion-policy";
import {
  extractStickerVariant,
  findNoviplySku,
  type InventoryMutationOutcome,
  type InventoryMutationRequest,
  type OperationsPolicy,
} from "@/domain/operations";
import {
  classifyValueBand,
  getSaleValueBand,
  policyValueForBand,
  resolveModelQuery,
  saleValueBands,
  type ModelResolution,
  type SaleValueBandId,
} from "@/domain/order-entry";
import {
  areStickerVerificationChecksComplete,
  createEmptyStickerVerificationChecks,
  stickerVerificationFailureLabel,
  type StickerVerificationCheckId,
  type StickerVerificationFailureReason,
  type StickerVerificationReportInput,
} from "@/domain/sticker-verification";

const layouts = ["QWERTY US", "AZERTY FR", "QWERTZ DE", "QWERTY UK", "QWERTY ES", "QWERTY IT"];

const instructions: Record<ConversionMethodId, string[]> = {
  none: ["Controleer de aanwezige layout.", "Registreer dat geen conversie nodig is.", "Zet de laptop door naar de volgende processtap."],
  loose_stickers: ["Controleer expliciete toestemming van de teamleider.", "Plaats iedere sticker afzonderlijk en uitgelijnd.", "Voer een volledige visuele kwaliteitscontrole uit."],
  noviply_sheet: ["Reinig het toetsenbord nadat de pakcontrole is goedgekeurd.", "Lijn het volledige vel uit zonder de kleeflaag voortijdig te raken.", "Breng het vel in één beweging aan en verwijder de drager.", "Voer de visuele eindcontrole uit. Bij afwijking: registreer ‘past niet’.", "Rond af; KeyFlow boekt pas nu één gebruikt vel af."],
  printed_sticker: ["Controleer model, layout en geprint vel.", "Reinig het keyboard en positioneer first-time-right.", "Breng het sterke vel zonder herpositioneren aan.", "Voer verplichte kwaliteitscontrole uit."],
  direct_reprint: ["Selecteer de juiste printertemplate.", "Controleer afscherming en positionering.", "Start inkt- en blue-lightcyclus.", "Controleer dekking, leesbaarheid en doellayout."],
};

type WorkStep = "input" | "advice" | "execution" | "completed";
type StockMode = "receipt" | "mismatch";

type Props = {
  catalog: InventoryCatalogItem[];
  orders: WorkOrderSnapshot[];
  quantities: Record<string, number>;
  policy: OperationsPolicy;
  onInventoryMutation: (request: InventoryMutationRequest) => InventoryMutationOutcome;
  onStickerVerification: (input: StickerVerificationReportInput) => unknown;
};

export function EmployeeWorkspace({
  catalog,
  orders,
  quantities,
  policy,
  onInventoryMutation,
  onStickerVerification,
}: Props) {
  const orderInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);
  const [orderReference, setOrderReference] = useState("");
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [modelQuery, setModelQuery] = useState("5420");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [saleBandId, setSaleBandId] = useState<SaleValueBandId>("200_299");
  const [currentLayout, setCurrentLayout] = useState("QWERTY UK");
  const [targetLayout, setTargetLayout] = useState("QWERTY US");
  const [step, setStep] = useState<WorkStep>("input");
  const [checks, setChecks] = useState<boolean[]>([]);
  const [stockMode, setStockMode] = useState<StockMode>("receipt");
  const [scanSku, setScanSku] = useState("NB10172E1NL");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockReference, setStockReference] = useState("");
  const [stockMessage, setStockMessage] = useState("");
  const [stockMismatchReason, setStockMismatchReason] = useState<StickerVerificationFailureReason>("position_mismatch");
  const [stockMismatchConfirmed, setStockMismatchConfirmed] = useState(false);
  const [executionMessage, setExecutionMessage] = useState("");
  const [stickerChecks, setStickerChecks] = useState(createEmptyStickerVerificationChecks);
  const [pickCheckConfirmed, setPickCheckConfirmed] = useState(false);
  const [verificationIssueOpen, setVerificationIssueOpen] = useState(false);
  const [verificationFailureReason, setVerificationFailureReason] = useState<StickerVerificationFailureReason>("position_mismatch");

  const modelOptions = useMemo(
    () => [...new Set(catalog.map((item) => item.model))].sort(),
    [catalog],
  );
  const modelResolution = useMemo(
    () => resolveModelQuery(modelQuery, modelOptions),
    [modelOptions, modelQuery],
  );
  const model = selectedModel
    ?? (modelResolution.status === "unique" ? modelResolution.model : "");
  const saleBand = getSaleValueBand(saleBandId);
  const valueBandClassification = classifyValueBand(saleBand, policy.thresholdEur);
  const saleValue = policyValueForBand(saleBand, policy.thresholdEur);
  const noviplyMatch = useMemo(
    () => findNoviplySku(model, targetLayout, catalog, quantities),
    [catalog, model, quantities, targetLayout],
  );
  const recommendation = useMemo(() => recommendConversion({
    saleValueEur: saleValue,
    saleValueLabel: saleBand.label,
    thresholdEur: policy.thresholdEur,
    currentLayout,
    targetLayout,
    workload: policy.workload,
    available: {
      loose_stickers: policy.methodEnabled.loose_stickers,
      noviply_sheet: policy.methodEnabled.noviply_sheet,
      printed_sticker: policy.methodEnabled.printed_sticker,
      direct_reprint: policy.methodEnabled.direct_reprint,
    },
    compatible: {
      loose_stickers: true,
      noviply_sheet: noviplyMatch.status === "matched",
      printed_sticker: true,
      direct_reprint: true,
    },
  }), [currentLayout, noviplyMatch.status, policy, saleBand.label, saleValue, targetLayout]);

  const methodInstructions = instructions[recommendation.primary];
  const matchedSticker = noviplyMatch.status === "matched" ? noviplyMatch : null;
  const selectedStockItem = catalog.find((item) => item.sku.toUpperCase() === scanSku.trim().toUpperCase()) ?? null;

  function startExecution() {
    setChecks(methodInstructions.map(() => false));
    setExecutionMessage("");
    setStickerChecks(createEmptyStickerVerificationChecks());
    setPickCheckConfirmed(false);
    setVerificationIssueOpen(false);
    setVerificationFailureReason("position_mismatch");
    if (matchedSticker) setScanSku(matchedSticker.item.sku);
    setStep("execution");
  }

  function reset() {
    setStep("input");
    setOrderReference("");
    setOrderConfirmed(false);
    setOrderFeedback(null);
    setModelQuery("");
    setSelectedModel(null);
    setChecks([]);
    setExecutionMessage("");
    setStickerChecks(createEmptyStickerVerificationChecks());
    setPickCheckConfirmed(false);
    setVerificationIssueOpen(false);
    requestAnimationFrame(() => orderInputRef.current?.focus());
  }

  function confirmOrder() {
    const result = lookupWorkOrder(orderReference, orders);
    if (result.status === "invalid") {
      setOrderConfirmed(false);
      setOrderFeedback({ tone: "error", message: "Scan of vul eerst een geldig ordernummer in." });
      return;
    }
    if (result.status === "found") {
      loadWorkOrder(result.order);
      return;
    }
    setOrderReference(orderReference.trim().toUpperCase());
    setOrderConfirmed(true);
    setOrderFeedback({
      tone: "warning",
      message: "Order niet gevonden in de gekoppelde pilotbron. Vul model, waardeklasse en layouts handmatig in.",
    });
    requestAnimationFrame(() => {
      modelInputRef.current?.focus();
      modelInputRef.current?.select();
    });
  }

  function loadWorkOrder(order: WorkOrderSnapshot) {
    setOrderReference(order.reference);
    setModelQuery(order.model);
    setSelectedModel(order.model);
    setSaleBandId(order.saleValueBandId);
    setCurrentLayout(order.currentLayout);
    setTargetLayout(order.targetLayout);
    setStep("input");
    if (order.status === "hold") {
      setOrderConfirmed(false);
      setOrderFeedback({ tone: "error", message: order.note || "Deze order staat geblokkeerd. Vraag een teamleider." });
      return;
    }
    setOrderConfirmed(true);
    setOrderFeedback({
      tone: "success",
      message: `${order.model}, ${getSaleValueBand(order.saleValueBandId).shortLabel} en ${order.targetLayout} automatisch geladen.`,
    });
    requestAnimationFrame(() => continueButtonRef.current?.focus());
  }

  function changeModelQuery(value: string) {
    setModelQuery(value);
    setSelectedModel(null);
  }

  function chooseModel(nextModel: string) {
    setSelectedModel(nextModel);
    setModelQuery(nextModel);
  }

  function completeExecution() {
    if (recommendation.primary === "noviply_sheet") {
      if (!matchedSticker) {
        setExecutionMessage("Afronden geblokkeerd: geen unieke Noviply-SKU beschikbaar.");
        return;
      }
      if (!pickCheckConfirmed) {
        setExecutionMessage("Afronden geblokkeerd: bevestig eerst hangmap, SKU, layout, E1/E2 en positionering.");
        return;
      }
      try {
        const result = onInventoryMutation({
          sku: matchedSticker.item.sku,
          type: "issue",
          quantity: 1,
          reasonCode: "conversion_usage",
          notes: `Hangmap ${matchedSticker.item.storageNumber} gecontroleerd · ${matchedSticker.variant} · ${currentLayout} naar ${targetLayout}`,
          reference: orderReference,
          actor: "Medewerker",
        });
        setExecutionMessage(`${matchedSticker.item.sku} automatisch −1 geboekt · nieuwe voorraad ${result.newQuantity}.`);
      } catch (error) {
        setExecutionMessage(error instanceof Error ? error.message : "Automatisch afboeken is niet gelukt.");
        return;
      }
    } else {
      setExecutionMessage("Uitvoering geregistreerd; deze methode gebruikt geen oud Noviply-voorraadvel.");
    }
    setStep("completed");
  }

  function confirmStickerPick() {
    if (!matchedSticker || !areStickerVerificationChecksComplete(stickerChecks)) {
      setExecutionMessage("Bevestig alle vijf controles voordat je het vel aanbrengt.");
      return;
    }
    onStickerVerification(verificationReport("passed"));
    setPickCheckConfirmed(true);
    setVerificationIssueOpen(false);
    setExecutionMessage(`Hangmap ${matchedSticker.item.storageNumber}, ${matchedSticker.item.sku}, ${matchedSticker.variant} en ${targetLayout} gecontroleerd. Je mag het vel nu aanbrengen.`);
  }

  function reportStickerIssue(bookAsScrap: boolean) {
    if (!matchedSticker) return;
    if (bookAsScrap && !policy.employeeCanBookMismatch) {
      setExecutionMessage("Management heeft uitvalboekingen voor werknemers uitgeschakeld.");
      return;
    }
    try {
      let stockMessage = "Geen voorraad afgeboekt; het vel is als ongebruikt gemeld.";
      if (bookAsScrap) {
        const result = onInventoryMutation({
          sku: matchedSticker.item.sku,
          type: "issue",
          quantity: 1,
          reasonCode: "verification_scrap",
          notes: `${stickerVerificationFailureLabel(verificationFailureReason)} · hangmap ${matchedSticker.item.storageNumber} · ${matchedSticker.variant}`,
          reference: orderReference,
          actor: "Medewerker",
        });
        stockMessage = `Uitval apart −1 geboekt · nog ${result.newQuantity} beschikbaar.`;
      }
      onStickerVerification(verificationReport(bookAsScrap ? "scrapped" : "blocked_unused", verificationFailureReason));
      setExecutionMessage(`${stickerVerificationFailureLabel(verificationFailureReason)}. ${stockMessage} Pak niet zomaar een andere variant; vraag bij twijfel een teamleider.`);
      setStickerChecks(createEmptyStickerVerificationChecks());
      setChecks(methodInstructions.map(() => false));
      setPickCheckConfirmed(false);
      setVerificationIssueOpen(false);
    } catch (error) {
      setExecutionMessage(error instanceof Error ? error.message : "Afwijking registreren is niet gelukt.");
    }
  }

  function verificationReport(
    outcome: StickerVerificationReportInput["outcome"],
    failureReason?: StickerVerificationFailureReason,
  ): StickerVerificationReportInput {
    if (!matchedSticker) throw new Error("Geen Noviply-sticker geselecteerd.");
    return {
      orderReference,
      sku: matchedSticker.item.sku,
      storageNumber: matchedSticker.item.storageNumber,
      model,
      targetLayout,
      variant: matchedSticker.variant,
      outcome,
      failureReason,
    };
  }

  function updateStock() {
    const sku = scanSku.trim().toUpperCase();
    const item = catalog.find((candidate) => candidate.sku.toUpperCase() === sku);
    if (!item) {
      setStockMessage("Onbekend SKU. Scan een nummer uit de Noviply-catalogus.");
      return;
    }
    if (stockMode === "receipt" && !policy.employeeCanReceive) {
      setStockMessage("Management heeft werknemersontvangsten uitgeschakeld.");
      return;
    }
    if (stockMode === "mismatch" && !policy.employeeCanBookMismatch) {
      setStockMessage("Management heeft uitvalboekingen voor werknemers uitgeschakeld.");
      return;
    }
    if (stockMode === "mismatch" && !stockReference.trim()) {
      setStockMessage("Vul het ordernummer in voordat je uitval boekt.");
      return;
    }
    if (stockMode === "mismatch" && !stockMismatchConfirmed) {
      setStockMessage("Bevestig dat het vel daadwerkelijk gebruikt of beschadigd is.");
      return;
    }
    try {
      const result = onInventoryMutation({
        sku,
        type: stockMode === "receipt" ? "receipt" : "issue",
        quantity: stockQuantity,
        reasonCode: stockMode === "receipt" ? "supplier_delivery" : "verification_scrap",
        notes: stockMode === "receipt" ? "Nieuwe bestelde stickers ontvangen" : `${stickerVerificationFailureLabel(stockMismatchReason)} · hangmap ${item.storageNumber}`,
        reference: stockReference || undefined,
        actor: "Medewerker",
      });
      if (stockMode === "mismatch") {
        onStickerVerification({
          orderReference: stockReference.trim(),
          sku,
          storageNumber: item.storageNumber,
          model: item.model,
          targetLayout: item.layout,
          variant: extractStickerVariant(item.sku),
          outcome: "scrapped",
          failureReason: stockMismatchReason,
        });
      }
      setStockMessage(`${sku}: ${result.quantityDelta > 0 ? "+" : ""}${result.quantityDelta} geboekt · nieuwe voorraad ${result.newQuantity}.`);
      setStockQuantity(1);
      setStockReference("");
      setStockMismatchConfirmed(false);
    } catch (error) {
      setStockMessage(error instanceof Error ? error.message : "Voorraad boeken is niet gelukt.");
    }
  }

  return (
    <div className="employee-workspace">
      <section className="employee-banner">
        <div><span>WERKNEMERSMODUS</span><h2>Scan, kies en voer uit</h2><p>Scan de order, typ alleen het modelnummer en kies een waardeklasse.</p></div>
        <div className="shift-summary"><span>Actief beleid</span><strong>Grens € {policy.thresholdEur}</strong><small>Werkdruk: {workloadLabel(policy.workload)}</small></div>
      </section>

      <div className="employee-grid">
        <section className="panel employee-task">
          <header className="employee-card-header">
            <div><span className="workspace-kicker">STAP {stepNumber(step)} VAN 4</span><h2>{stepTitle(step)}</h2></div>
            {step !== "input" && <button className="secondary-button" onClick={reset}>Nieuwe order</button>}
          </header>

          {step === "input" && (
            <div className="employee-input-layout">
              <div className="employee-form">
                <label className="wide scan-order-field">
                  <span>1. Scan ordernummer of laptop-ID</span>
                  <div className={`scan-order-input ${orderConfirmed ? "confirmed" : ""}`}>
                    <b aria-hidden="true">▥</b>
                    <input
                      ref={orderInputRef}
                      value={orderReference}
                      onChange={(event) => {
                        setOrderReference(event.target.value);
                        setOrderConfirmed(false);
                        setOrderFeedback(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Tab") confirmOrder();
                      }}
                      onBlur={() => {
                        if (orderReference.trim() && !orderConfirmed) confirmOrder();
                      }}
                      placeholder="Scan de barcode…"
                      autoFocus
                    />
                    <button type="button" disabled={!orderReference.trim()} onClick={confirmOrder}>{orderFeedback?.tone === "success" ? "✓ Geladen" : orderConfirmed ? "✓ Bevestigd" : "Opzoeken"}</button>
                  </div>
                  <small>De scanner geeft automatisch Enter; daarna springt KeyFlow naar het modelnummer.</small>
                  {orderFeedback && <div className={`order-lookup-feedback ${orderFeedback.tone}`}>{orderFeedback.message}</div>}
                </label>
                <label className="wide model-entry-field">
                  <span>2. Typ alleen het modelnummer</span>
                  <input
                    ref={modelInputRef}
                    value={modelQuery}
                    onChange={(event) => changeModelQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && modelResolution.status === "unique") {
                        chooseModel(modelResolution.model);
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="Bijvoorbeeld 5420, 850 G7 of U7410"
                    aria-describedby="model-resolution"
                  />
                  <ModelResolver resolution={modelResolution} selectedModel={model} onSelect={chooseModel} />
                </label>
                <fieldset className="wide value-band-field">
                  <legend>3. Kies de verkoopwaardeklasse</legend>
                  <div>
                    {saleValueBands.map((band) => (
                      <button type="button" key={band.id} className={saleBandId === band.id ? "active" : ""} onClick={() => setSaleBandId(band.id)}>{band.shortLabel}</button>
                    ))}
                  </div>
                </fieldset>
                <label><span>Huidige layout</span><select value={currentLayout} onChange={(event) => setCurrentLayout(event.target.value)}>{layouts.map((layout) => <option key={layout}>{layout}</option>)}</select></label>
                <label><span>Gewenste klantlayout</span><select value={targetLayout} onChange={(event) => setTargetLayout(event.target.value)}>{layouts.map((layout) => <option key={layout}>{layout}</option>)}</select></label>
              </div>
              {valueBandClassification === "overlap" && <div className="value-band-warning">De managementgrens van €{policy.thresholdEur} valt midden in {saleBand.label}. Laat management de grens op een klassengrens zetten of controleer het exacte bedrag.</div>}
              <LiveAdvice recommendation={recommendation} match={noviplyMatch} />
              <button ref={continueButtonRef} className="employee-primary employee-continue" disabled={!orderConfirmed || !model || recommendation.primary === "none" || valueBandClassification === "overlap"} onClick={() => setStep("advice")}>Open advies voor {model || "gekozen model"} →</button>
            </div>
          )}

          {step === "advice" && (
            <div className="employee-advice">
              <div className={`employee-method ${recommendation.primary === "none" ? "blocked" : ""}`}>
                <span>GEBRUIK DEZE METHODE</span>
                <strong>{methodLabel(recommendation.primary)}</strong>
                <p>{recommendation.reason}</p>
              </div>
              {recommendation.primary === "noviply_sheet" && matchedSticker && (
                <div className="pick-sticker-card">
                  <div><span>PAK UIT DE HANGMAPPENWAGEN</span><strong>Hangmap {matchedSticker.item.storageNumber}</strong><small>Exacte locatie uit Excel-kolom ‘nr.’</small></div>
                  <div><span>CONTROLEER HET ETIKET</span><strong>{matchedSticker.item.sku}</strong><small>{matchedSticker.variant} · {matchedSticker.item.layout} · {matchedSticker.currentStock} beschikbaar</small></div>
                </div>
              )}
              {recommendation.primary === "noviply_sheet" && matchedSticker?.item.sourceNote && (
                <div className="source-fit-warning"><strong>Let op uit de Excel-lijst</strong><span>{matchedSticker.item.sourceNote}</span></div>
              )}
              <dl className="employee-order-summary">
                <div><dt>Order</dt><dd>{orderReference}</dd></div>
                <div><dt>Model</dt><dd>{model}</dd></div>
                <div><dt>Layout</dt><dd>{currentLayout} → {targetLayout}</dd></div>
                <div><dt>Waarde</dt><dd>{saleBand.label}</dd></div>
              </dl>
              {recommendation.warnings.map((warning) => <div className="employee-warning" key={warning}>{warning}</div>)}
              <button className="employee-primary" disabled={recommendation.primary === "none"} onClick={startExecution}>Start uitvoering</button>
            </div>
          )}

          {step === "execution" && (
            <div className="execution-checklist">
              <div className="execution-method-line">
                <div><span className="method-pill">{methodLabel(recommendation.primary)}</span><p>Vink iedere stap pas af nadat deze werkelijk is uitgevoerd.</p></div>
                {recommendation.primary === "noviply_sheet" && matchedSticker && <strong>Hangmap {matchedSticker.item.storageNumber} · {matchedSticker.item.sku} · {matchedSticker.variant}</strong>}
              </div>
              {recommendation.primary === "noviply_sheet" && matchedSticker && (
                <section className={`pick-verification ${pickCheckConfirmed ? "confirmed" : ""}`}>
                  <div className="pick-verification-heading">
                    <div><span>VERPLICHTE CONTROLE VÓÓR AANBRENGEN</span><h3>Klopt het vel uit hangmap {matchedSticker.item.storageNumber}?</h3><p>Er wordt nog niets afgeboekt. Bevestig eerst elk controlepunt.</p></div>
                    <strong>{pickCheckConfirmed ? "✓ Goedgekeurd" : "Nog controleren"}</strong>
                  </div>
                  <div className="verification-reference">
                    <div><span>Locatie</span><strong>Hangmappenwagen · nr. {matchedSticker.item.storageNumber}</strong></div>
                    <div><span>Artikel</span><strong>{matchedSticker.item.sku}</strong></div>
                    <div><span>Variant</span><strong>{matchedSticker.variant}</strong></div>
                    <div><span>Doellayout</span><strong>{targetLayout}</strong></div>
                  </div>
                  {matchedSticker.item.sourceNote && <div className="source-fit-warning"><strong>Bronwaarschuwing</strong><span>{matchedSticker.item.sourceNote}</span></div>}
                  <div className="verification-checks">
                    {verificationCheckOptions(matchedSticker.item.storageNumber, matchedSticker.item.sku, matchedSticker.variant, targetLayout).map((option) => (
                      <label className={stickerChecks[option.id] ? "checked" : ""} key={option.id}>
                        <input
                          type="checkbox"
                          checked={stickerChecks[option.id]}
                          disabled={pickCheckConfirmed}
                          onChange={(event) => setStickerChecks((current) => ({ ...current, [option.id]: event.target.checked }))}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  {!pickCheckConfirmed && (
                    <div className="verification-actions">
                      <button className="employee-primary" disabled={!areStickerVerificationChecksComplete(stickerChecks)} onClick={confirmStickerPick}>Ja, controle klopt · ga door</button>
                      <button className="mismatch-button" onClick={() => setVerificationIssueOpen((open) => !open)}>Nee, er wijkt iets af</button>
                    </div>
                  )}
                  {verificationIssueOpen && (
                    <div className="verification-issue">
                      <label><span>Wat klopt niet?</span><select value={verificationFailureReason} onChange={(event) => setVerificationFailureReason(event.target.value as StickerVerificationFailureReason)}>{verificationFailureOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
                      <p>Kies “zonder afboeken” als het vel nog bruikbaar is. Boek alleen uitval als het vel al is aangebracht of beschadigd.</p>
                      <div>
                        <button onClick={() => reportStickerIssue(false)}>Melden · niet afboeken</button>
                        {policy.employeeCanBookMismatch && <button className="scrap" onClick={() => reportStickerIssue(true)}>Vel gebruikt/beschadigd · −1</button>}
                      </div>
                    </div>
                  )}
                </section>
              )}
              {(recommendation.primary !== "noviply_sheet" || pickCheckConfirmed) && methodInstructions.map((instruction, index) => (
                <label className={checks[index] ? "checked" : ""} key={instruction}>
                  <input type="checkbox" checked={checks[index] ?? false} onChange={(event) => setChecks((current) => current.map((value, checkIndex) => checkIndex === index ? event.target.checked : value))} />
                  <span><b>{index + 1}</b>{instruction}</span>
                </label>
              ))}
              {recommendation.primary === "noviply_sheet" && pickCheckConfirmed && (
                <button className="mismatch-button" onClick={() => { setVerificationFailureReason("position_mismatch"); setVerificationIssueOpen(true); }}>Sticker past na aanbrengen niet · meld uitval</button>
              )}
              {executionMessage && <div className="stock-feedback">{executionMessage}</div>}
              <button className="employee-primary" disabled={!checks.every(Boolean) || (recommendation.primary === "noviply_sheet" && !pickCheckConfirmed)} onClick={completeExecution}>Afronden en voorraad verwerken</button>
            </div>
          )}

          {step === "completed" && (
            <div className="employee-completed">
              <span>✓</span><h3>Conversie en voorraad verwerkt</h3><p>{orderReference} · {model}</p>
              {executionMessage && <div className="completion-stock">{executionMessage}</div>}
              <div><strong>Volgende stap</strong>Kwaliteitscontrole en vrijgave voor verzending.</div>
              <button className="employee-primary" onClick={reset}>Volgende laptop</button>
            </div>
          )}
        </section>

        <aside className="employee-side">
          <section className="panel quick-stock">
            <span className="workspace-kicker">VOORRAAD BIJWERKEN</span><h3>Ontvangst of niet-passende sticker</h3><p>Iedere boeking verschijnt direct in de managementanalyse.</p>
            <div className="stock-mode-switch">
              <button className={stockMode === "receipt" ? "active" : ""} onClick={() => { setStockMode("receipt"); setStockMessage(""); setStockMismatchConfirmed(false); }}>Nieuwe levering</button>
              <button className={stockMode === "mismatch" ? "active" : ""} onClick={() => { setStockMode("mismatch"); setStockMessage(""); setStockMismatchConfirmed(false); }}>Past niet</button>
            </div>
            <label><span>Sticker-SKU</span><input list="employee-skus" value={scanSku} onChange={(event) => { setScanSku(event.target.value); setStockMessage(""); }} placeholder="Scan of vul SKU in…" /><datalist id="employee-skus">{catalog.map((item) => <option key={item.sku} value={item.sku}>{item.model}</option>)}</datalist></label>
            {selectedStockItem && <div className="quick-storage-reference"><strong>Hangmap {selectedStockItem.storageNumber}</strong><span>{extractStickerVariant(selectedStockItem.sku)} · {selectedStockItem.layout} · {selectedStockItem.model}</span></div>}
            <label><span>Aantal</span><input type="number" min="1" value={stockQuantity} onChange={(event) => setStockQuantity(Math.max(1, Number(event.target.value)))} /></label>
            {stockMode === "mismatch" && <label><span>Reden van uitval</span><select value={stockMismatchReason} onChange={(event) => setStockMismatchReason(event.target.value as StickerVerificationFailureReason)}>{verificationFailureOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>}
            <label><span>{stockMode === "receipt" ? "Pakbon / bestelling" : "Ordernummer (verplicht)"}</span><input value={stockReference} onChange={(event) => setStockReference(event.target.value)} placeholder={stockMode === "receipt" ? "PO- of pakbonnummer" : "Bijvoorbeeld ORD-1859"} /></label>
            {stockMode === "mismatch" && <label className="quick-scrap-confirm"><input type="checkbox" checked={stockMismatchConfirmed} onChange={(event) => setStockMismatchConfirmed(event.target.checked)} /><span>Ik bevestig dat dit vel gebruikt of beschadigd is en −1 moet worden afgeboekt.</span></label>}
            <button disabled={stockMode === "mismatch" && (!stockReference.trim() || !stockMismatchConfirmed)} onClick={updateStock}>{stockMode === "receipt" ? `+${stockQuantity} inboeken` : `−${stockQuantity} uitval boeken`}</button>
            {stockMessage && <div className="stock-feedback">{stockMessage}</div>}
          </section>
          <section className="panel employee-queue">
            <div><span className="workspace-kicker">MIJN WACHTRIJ</span><b>3 open</b></div>
            {orders.filter((order) => order.status === "ready").slice(0, 3).map((order) => (
              <button
                key={order.reference}
                onClick={() => loadWorkOrder(order)}
              >
                <span><strong>{order.aliases[0] || order.reference}</strong><small>{order.model}</small></span><b>{order.targetLayout}</b>
              </button>
            ))}
          </section>
          <section className="employee-help">
            <strong>Twijfel over E1/E2 of pasvorm?</strong><p>Niet gokken. Boek een mislukte pastest apart en vraag een teamleider; zo verbetert de compatibiliteitsdata.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ModelResolver({
  resolution,
  selectedModel,
  onSelect,
}: {
  resolution: ModelResolution;
  selectedModel: string;
  onSelect: (model: string) => void;
}) {
  if (selectedModel && resolution.status === "unique") {
    return <div id="model-resolution" className="model-resolution resolved"><b>✓ Automatisch herkend</b><strong>{selectedModel}</strong></div>;
  }
  if (resolution.status === "multiple") {
    return (
      <div id="model-resolution" className="model-resolution multiple">
        <b>Kies het juiste model</b>
        <div role="listbox" aria-label="Gevonden laptopmodellen">
          {resolution.matches.map((match) => <button type="button" role="option" aria-selected={selectedModel === match} key={match} onClick={() => onSelect(match)}>{match}</button>)}
        </div>
      </div>
    );
  }
  if (resolution.status === "none") {
    return <div id="model-resolution" className="model-resolution not-found"><b>Geen model gevonden</b><span>Controleer het nummer of vraag een teamleider het model toe te voegen.</span></div>;
  }
  return <div id="model-resolution" className="model-resolution hint"><span>Merk en serie worden automatisch aangevuld.</span></div>;
}

function LiveAdvice({
  recommendation,
  match,
}: {
  recommendation: ReturnType<typeof recommendConversion>;
  match: ReturnType<typeof findNoviplySku>;
}) {
  return (
    <section className="live-advice">
      <div><span>DIRECT ADVIES</span><strong>{methodLabel(recommendation.primary)}</strong></div>
      {recommendation.primary === "noviply_sheet" && match.status === "matched" ? (
        <div className="live-sticker-number"><span>Pak hangmap</span><strong>Nr. {match.item.storageNumber}</strong><small>{match.item.sku} · {match.variant} · {match.currentStock} op voorraad</small></div>
      ) : (
        <p>{recommendation.reason}</p>
      )}
      {match.status === "out_of_stock" && <small className="employee-warning">Exacte SKU {match.item.sku} is uitverkocht; KeyFlow kiest een beschikbare fallback.</small>}
      {match.status === "ambiguous" && <small className="employee-warning">Meerdere E-varianten gevonden. Laat management de exacte keyboardvariant vastleggen.</small>}
      {match.status === "not_found" && targetCouldUseNoviply(recommendation.policy.rule) && <small className="employee-warning">Geen gevalideerde oude Noviply-SKU voor deze model-layoutcombinatie.</small>}
    </section>
  );
}

function targetCouldUseNoviply(rule: string) {
  return rule === "qwerty_us_below_threshold";
}

const verificationFailureOptions: { value: StickerVerificationFailureReason; label: string }[] = [
  { value: "wrong_storage", label: "Verkeerde hangmap gepakt" },
  { value: "wrong_sku", label: "Artikelnummer op het vel wijkt af" },
  { value: "wrong_layout", label: "Layout op het vel wijkt af" },
  { value: "wrong_variant", label: "E1/E2-variant klopt niet" },
  { value: "position_mismatch", label: "Toetsvorm of positionering past niet" },
  { value: "other", label: "Andere afwijking" },
];

function verificationCheckOptions(
  storageNumber: number,
  sku: string,
  variant: string,
  targetLayout: string,
): { id: StickerVerificationCheckId; label: string }[] {
  return [
    { id: "storage", label: `Ik heb hangmap ${storageNumber} uit de hangmappenwagen.` },
    { id: "sku", label: `Het etiket toont exact artikelnummer ${sku}.` },
    { id: "layout", label: `De taal/layout op het vel is ${targetLayout}.` },
    { id: "variant", label: `De uitvoering is ${variant}; E1/E2 is gecontroleerd.` },
    { id: "positioning", label: "Toetsvormen, uitsparingen en positionering lijnen droog correct uit." },
  ];
}

function stepNumber(step: WorkStep) {
  return { input: 1, advice: 2, execution: 3, completed: 4 }[step];
}

function stepTitle(step: WorkStep) {
  return {
    input: "Scan de order en kies het model",
    advice: "Controleer methode en stickernummer",
    execution: "Volg de werkinstructies",
    completed: "Uitvoering afgerond",
  }[step];
}

function workloadLabel(workload: OperationsPolicy["workload"]) {
  return { normal: "normaal", busy: "druk", critical: "kritiek" }[workload];
}
