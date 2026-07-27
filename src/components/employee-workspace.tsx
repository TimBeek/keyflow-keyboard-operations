"use client";

import { useMemo, useState } from "react";
import type { InventoryCatalogItem } from "@/data/inventory-demo";
import {
  methodLabel,
  recommendConversion,
  type ConversionMethodId,
} from "@/domain/conversion-policy";
import {
  findNoviplySku,
  type InventoryMutationOutcome,
  type InventoryMutationRequest,
  type OperationsPolicy,
} from "@/domain/operations";

const layouts = ["QWERTY US", "AZERTY FR", "QWERTZ DE", "QWERTY UK", "QWERTY ES", "QWERTY IT"];

const instructions: Record<ConversionMethodId, string[]> = {
  none: ["Controleer de aanwezige layout.", "Registreer dat geen conversie nodig is.", "Zet de laptop door naar de volgende processtap."],
  loose_stickers: ["Controleer expliciete toestemming van de teamleider.", "Plaats iedere sticker afzonderlijk en uitgelijnd.", "Voer een volledige visuele kwaliteitscontrole uit."],
  noviply_sheet: ["Pak uitsluitend het geadviseerde SKU en controleer E1/E2.", "Lijn het volledige vel uit op het keyboard.", "Breng het vel in één beweging aan en verwijder de drager.", "Voer de visuele pastest uit. Bij afwijking: registreer ‘past niet’.", "Rond af; KeyFlow boekt automatisch één gebruikt vel af."],
  printed_sticker: ["Controleer model, layout en geprint vel.", "Reinig het keyboard en positioneer first-time-right.", "Breng het sterke vel zonder herpositioneren aan.", "Voer verplichte kwaliteitscontrole uit."],
  direct_reprint: ["Selecteer de juiste printertemplate.", "Controleer afscherming en positionering.", "Start inkt- en blue-lightcyclus.", "Controleer dekking, leesbaarheid en doellayout."],
};

type WorkStep = "input" | "advice" | "execution" | "completed";
type StockMode = "receipt" | "mismatch";

type Props = {
  catalog: InventoryCatalogItem[];
  quantities: Record<string, number>;
  policy: OperationsPolicy;
  onInventoryMutation: (request: InventoryMutationRequest) => InventoryMutationOutcome;
};

export function EmployeeWorkspace({
  catalog,
  quantities,
  policy,
  onInventoryMutation,
}: Props) {
  const [orderReference, setOrderReference] = useState("ORD-260727-1859");
  const [model, setModel] = useState("Dell Latitude 7400");
  const [saleValue, setSaleValue] = useState(279);
  const [currentLayout, setCurrentLayout] = useState("QWERTY UK");
  const [targetLayout, setTargetLayout] = useState("QWERTY US");
  const [step, setStep] = useState<WorkStep>("input");
  const [checks, setChecks] = useState<boolean[]>([]);
  const [stockMode, setStockMode] = useState<StockMode>("receipt");
  const [scanSku, setScanSku] = useState("NB10052E1NL");
  const [stockQuantity, setStockQuantity] = useState(1);
  const [stockReference, setStockReference] = useState("");
  const [stockMessage, setStockMessage] = useState("");
  const [executionMessage, setExecutionMessage] = useState("");

  const modelOptions = useMemo(
    () => [...new Set(catalog.map((item) => item.model))].sort(),
    [catalog],
  );
  const noviplyMatch = useMemo(
    () => findNoviplySku(model, targetLayout, catalog, quantities),
    [catalog, model, quantities, targetLayout],
  );
  const recommendation = useMemo(() => recommendConversion({
    saleValueEur: saleValue,
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
  }), [currentLayout, noviplyMatch.status, policy, saleValue, targetLayout]);

  const methodInstructions = instructions[recommendation.primary];
  const matchedSticker = noviplyMatch.status === "matched" ? noviplyMatch : null;

  function startExecution() {
    setChecks(methodInstructions.map(() => false));
    setExecutionMessage("");
    if (matchedSticker) setScanSku(matchedSticker.item.sku);
    setStep("execution");
  }

  function reset() {
    setStep("input");
    setChecks([]);
    setExecutionMessage("");
  }

  function completeExecution() {
    if (recommendation.primary === "noviply_sheet") {
      if (!matchedSticker) {
        setExecutionMessage("Afronden geblokkeerd: geen unieke Noviply-SKU beschikbaar.");
        return;
      }
      try {
        const result = onInventoryMutation({
          sku: matchedSticker.item.sku,
          type: "issue",
          quantity: 1,
          reasonCode: "conversion_usage",
          notes: `${currentLayout} naar ${targetLayout}`,
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

  function bookMismatch() {
    if (!policy.employeeCanBookMismatch || !matchedSticker) return;
    try {
      const result = onInventoryMutation({
        sku: matchedSticker.item.sku,
        type: "issue",
        quantity: 1,
        reasonCode: "fit_mismatch",
        notes: `Sticker paste niet op ${model}; controleer ${matchedSticker.variant}.`,
        reference: orderReference,
        actor: "Medewerker",
      });
      setExecutionMessage(`Niet-passende ${matchedSticker.item.sku} apart −1 geboekt · nog ${result.newQuantity} beschikbaar. Pak een nieuw vel of vraag een teamleider.`);
    } catch (error) {
      setExecutionMessage(error instanceof Error ? error.message : "Uitval boeken is niet gelukt.");
    }
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
    try {
      const result = onInventoryMutation({
        sku,
        type: stockMode === "receipt" ? "receipt" : "issue",
        quantity: stockQuantity,
        reasonCode: stockMode === "receipt" ? "supplier_delivery" : "fit_mismatch",
        notes: stockMode === "receipt" ? "Nieuwe bestelde stickers ontvangen" : "Sticker past niet",
        reference: stockReference || undefined,
        actor: "Medewerker",
      });
      setStockMessage(`${sku}: ${result.quantityDelta > 0 ? "+" : ""}${result.quantityDelta} geboekt · nieuwe voorraad ${result.newQuantity}.`);
      setStockQuantity(1);
      setStockReference("");
    } catch (error) {
      setStockMessage(error instanceof Error ? error.message : "Voorraad boeken is niet gelukt.");
    }
  }

  return (
    <div className="employee-workspace">
      <section className="employee-banner">
        <div><span>WERKNEMERSMODUS</span><h2>Welke methode moet ik gebruiken?</h2><p>Vul de laptop in. Methode, sticker-SKU en voorraad verschijnen direct.</p></div>
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
                <label className="wide"><span>Ordernummer of laptop-ID</span><input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} autoFocus /></label>
                <label className="wide"><span>Laptopmodel</span><input list="employee-models" value={model} onChange={(event) => setModel(event.target.value)} /><datalist id="employee-models">{modelOptions.map((option) => <option key={option} value={option} />)}</datalist></label>
                <label><span>Verkoopwaarde</span><div className="money-input"><b>€</b><input type="number" min="0" value={saleValue} onChange={(event) => setSaleValue(Number(event.target.value))} /></div></label>
                <label><span>Huidige layout</span><select value={currentLayout} onChange={(event) => setCurrentLayout(event.target.value)}>{layouts.map((layout) => <option key={layout}>{layout}</option>)}</select></label>
                <label><span>Gewenste klantlayout</span><select value={targetLayout} onChange={(event) => setTargetLayout(event.target.value)}>{layouts.map((layout) => <option key={layout}>{layout}</option>)}</select></label>
              </div>
              <LiveAdvice recommendation={recommendation} match={noviplyMatch} />
              <button className="employee-primary employee-continue" disabled={!orderReference.trim() || !model.trim() || recommendation.primary === "none"} onClick={() => setStep("advice")}>Open advies en werkinstructie →</button>
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
                  <div><span>PAK DIT STICKERVEL</span><strong>{matchedSticker.item.sku}</strong><small>{matchedSticker.variant} · {matchedSticker.item.layout}</small></div>
                  <div><span>LOCATIE</span><strong>{matchedSticker.item.location}</strong><small>{matchedSticker.currentStock} vellen beschikbaar</small></div>
                </div>
              )}
              <dl className="employee-order-summary">
                <div><dt>Order</dt><dd>{orderReference}</dd></div>
                <div><dt>Model</dt><dd>{model}</dd></div>
                <div><dt>Layout</dt><dd>{currentLayout} → {targetLayout}</dd></div>
                <div><dt>Waarde</dt><dd>€ {saleValue.toLocaleString("nl-NL")}</dd></div>
              </dl>
              {recommendation.warnings.map((warning) => <div className="employee-warning" key={warning}>{warning}</div>)}
              <button className="employee-primary" disabled={recommendation.primary === "none"} onClick={startExecution}>Start uitvoering</button>
            </div>
          )}

          {step === "execution" && (
            <div className="execution-checklist">
              <div className="execution-method-line">
                <div><span className="method-pill">{methodLabel(recommendation.primary)}</span><p>Vink iedere stap pas af nadat deze werkelijk is uitgevoerd.</p></div>
                {recommendation.primary === "noviply_sheet" && matchedSticker && <strong>{matchedSticker.item.sku} · {matchedSticker.variant}</strong>}
              </div>
              {methodInstructions.map((instruction, index) => (
                <label className={checks[index] ? "checked" : ""} key={instruction}>
                  <input type="checkbox" checked={checks[index] ?? false} onChange={(event) => setChecks((current) => current.map((value, checkIndex) => checkIndex === index ? event.target.checked : value))} />
                  <span><b>{index + 1}</b>{instruction}</span>
                </label>
              ))}
              {recommendation.primary === "noviply_sheet" && policy.employeeCanBookMismatch && (
                <button className="mismatch-button" onClick={bookMismatch}>Sticker past niet · boek uitval −1</button>
              )}
              {executionMessage && <div className="stock-feedback">{executionMessage}</div>}
              <button className="employee-primary" disabled={!checks.every(Boolean)} onClick={completeExecution}>Afronden en voorraad verwerken</button>
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
              <button className={stockMode === "receipt" ? "active" : ""} onClick={() => { setStockMode("receipt"); setStockMessage(""); }}>Nieuwe levering</button>
              <button className={stockMode === "mismatch" ? "active" : ""} onClick={() => { setStockMode("mismatch"); setStockMessage(""); }}>Past niet</button>
            </div>
            <label><span>Sticker-SKU</span><input list="employee-skus" value={scanSku} onChange={(event) => { setScanSku(event.target.value); setStockMessage(""); }} placeholder="Scan of vul SKU in…" /><datalist id="employee-skus">{catalog.map((item) => <option key={item.sku} value={item.sku}>{item.model}</option>)}</datalist></label>
            <label><span>Aantal</span><input type="number" min="1" value={stockQuantity} onChange={(event) => setStockQuantity(Math.max(1, Number(event.target.value)))} /></label>
            <label><span>{stockMode === "receipt" ? "Pakbon / bestelling" : "Order / toelichting"}</span><input value={stockReference} onChange={(event) => setStockReference(event.target.value)} placeholder={stockMode === "receipt" ? "PO- of pakbonnummer" : "Optioneel ordernummer"} /></label>
            <button onClick={updateStock}>{stockMode === "receipt" ? `+${stockQuantity} inboeken` : `−${stockQuantity} uitval boeken`}</button>
            {stockMessage && <div className="stock-feedback">{stockMessage}</div>}
          </section>
          <section className="panel employee-queue">
            <div><span className="workspace-kicker">MIJN WACHTRIJ</span><b>3 open</b></div>
            {[
              ["ORD-1859", "Dell Latitude 7400", "QWERTY US"],
              ["ORD-1861", "HP EliteBook 850 G7", "QWERTY US"],
              ["ORD-1864", "HP ZBook 15 G3", "QWERTZ DE"],
            ].map(([order, laptop, layout]) => <button key={order}><span><strong>{order}</strong><small>{laptop}</small></span><b>{layout}</b></button>)}
          </section>
          <section className="employee-help">
            <strong>Twijfel over E1/E2 of pasvorm?</strong><p>Niet gokken. Boek een mislukte pastest apart en vraag een teamleider; zo verbetert de compatibiliteitsdata.</p>
          </section>
        </aside>
      </div>
    </div>
  );
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
        <div className="live-sticker-number"><span>Pak nummer</span><strong>{match.item.sku}</strong><small>{match.variant} · {match.currentStock} op voorraad · {match.item.location}</small></div>
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

function stepNumber(step: WorkStep) {
  return { input: 1, advice: 2, execution: 3, completed: 4 }[step];
}

function stepTitle(step: WorkStep) {
  return {
    input: "Vul de laptopgegevens in",
    advice: "Controleer methode en stickernummer",
    execution: "Volg de werkinstructies",
    completed: "Uitvoering afgerond",
  }[step];
}

function workloadLabel(workload: OperationsPolicy["workload"]) {
  return { normal: "normaal", busy: "druk", critical: "kritiek" }[workload];
}
