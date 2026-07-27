"use client";

import { useMemo, useState } from "react";
import {
  methodLabel,
  recommendConversion,
  type ConversionMethodId,
} from "@/domain/conversion-policy";

const layouts = ["QWERTY US", "AZERTY FR", "QWERTZ DE", "QWERTY UK", "QWERTY ES", "QWERTY IT"];

const instructions: Record<ConversionMethodId, string[]> = {
  none: ["Controleer de aanwezige layout.", "Registreer dat geen conversie nodig is.", "Zet de laptop door naar de volgende processtap."],
  loose_stickers: ["Controleer expliciete toestemming van de teamleider.", "Plaats iedere sticker afzonderlijk en uitgelijnd.", "Voer een volledige visuele kwaliteitscontrole uit."],
  noviply_sheet: ["Controleer SKU en keyboardcompatibiliteit.", "Lijn het volledige vel uit op het keyboard.", "Breng het vel in één beweging aan en verwijder de drager.", "Boek één voorraadvel af."],
  printed_sticker: ["Controleer model, layout en geprint vel.", "Reinig het keyboard en positioneer first-time-right.", "Breng het sterke vel zonder herpositioneren aan.", "Voer verplichte kwaliteitscontrole uit."],
  direct_reprint: ["Selecteer de juiste printertemplate.", "Controleer afscherming en positionering.", "Start inkt- en blue-lightcyclus.", "Controleer dekking, leesbaarheid en doellayout."],
};

type WorkStep = "input" | "advice" | "execution" | "completed";

export function EmployeeWorkspace() {
  const [orderReference, setOrderReference] = useState("ORD-260727-1859");
  const [model, setModel] = useState("Dell Latitude 5420");
  const [saleValue, setSaleValue] = useState(279);
  const [currentLayout, setCurrentLayout] = useState("QWERTY US");
  const [targetLayout, setTargetLayout] = useState("AZERTY FR");
  const [step, setStep] = useState<WorkStep>("input");
  const [checks, setChecks] = useState<boolean[]>([]);
  const [scanSku, setScanSku] = useState("");
  const [stockMessage, setStockMessage] = useState("");

  const recommendation = useMemo(() => recommendConversion({
    saleValueEur: saleValue,
    thresholdEur: 300,
    currentLayout,
    targetLayout,
    workload: "normal",
    available: {
      loose_stickers: true,
      noviply_sheet: true,
      printed_sticker: true,
      direct_reprint: true,
    },
    compatible: {
      loose_stickers: true,
      noviply_sheet: true,
      printed_sticker: true,
      direct_reprint: true,
    },
  }), [currentLayout, saleValue, targetLayout]);

  const methodInstructions = instructions[recommendation.primary];

  function startExecution() {
    setChecks(methodInstructions.map(() => false));
    setStep("execution");
  }

  function reset() {
    setStep("input");
    setChecks([]);
  }

  function quickIssue() {
    const sku = scanSku.trim().toUpperCase();
    if (!/^NB\d+E\d+(NL|FR|DE)$/.test(sku)) {
      setStockMessage("Scan of vul eerst een geldig sticker-SKU in.");
      return;
    }
    setStockMessage(`${sku}: 1 vel afboeken voorbereid · bevestiging wordt in productie opgeslagen.`);
    setScanSku("");
  }

  return (
    <div className="employee-workspace">
      <section className="employee-banner">
        <div><span>WERKNEMERSMODUS</span><h2>Keyboarduitvoering</h2><p>Vul de laptopgegevens in. KeyFlow geeft de methode en werkinstructies.</p></div>
        <div className="shift-summary"><span>Mijn dienst</span><strong>7 uitgevoerd</strong><small>1 wacht op kwaliteitscontrole</small></div>
      </section>

      <div className="employee-grid">
        <section className="panel employee-task">
          <header className="employee-card-header">
            <div><span className="workspace-kicker">STAP {stepNumber(step)} VAN 4</span><h2>{stepTitle(step)}</h2></div>
            {step !== "input" && <button className="secondary-button" onClick={reset}>Nieuwe order</button>}
          </header>

          {step === "input" && (
            <div className="employee-form">
              <label className="wide"><span>Ordernummer of laptop-ID</span><input value={orderReference} onChange={(event) => setOrderReference(event.target.value)} autoFocus /></label>
              <label className="wide"><span>Laptopmodel</span><input value={model} onChange={(event) => setModel(event.target.value)} /></label>
              <label><span>Verkoopwaarde</span><div className="money-input"><b>€</b><input type="number" min="0" value={saleValue} onChange={(event) => setSaleValue(Number(event.target.value))} /></div></label>
              <label><span>Huidige layout</span><select value={currentLayout} onChange={(event) => setCurrentLayout(event.target.value)}>{layouts.map((layout) => <option key={layout}>{layout}</option>)}</select></label>
              <label><span>Gewenste klantlayout</span><select value={targetLayout} onChange={(event) => setTargetLayout(event.target.value)}>{layouts.map((layout) => <option key={layout}>{layout}</option>)}</select></label>
              <button className="employee-primary wide" disabled={!orderReference.trim() || !model.trim()} onClick={() => setStep("advice")}>Geef mij de juiste methode →</button>
            </div>
          )}

          {step === "advice" && (
            <div className="employee-advice">
              <div className={`employee-method ${recommendation.primary === "none" ? "blocked" : ""}`}>
                <span>GEADVISEERDE METHODE</span>
                <strong>{methodLabel(recommendation.primary)}</strong>
                <p>{recommendation.reason}</p>
              </div>
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
              <div><span className="method-pill">{methodLabel(recommendation.primary)}</span><p>Vink iedere stap pas af nadat deze werkelijk is uitgevoerd.</p></div>
              {methodInstructions.map((instruction, index) => (
                <label className={checks[index] ? "checked" : ""} key={instruction}>
                  <input type="checkbox" checked={checks[index] ?? false} onChange={(event) => setChecks((current) => current.map((value, checkIndex) => checkIndex === index ? event.target.checked : value))} />
                  <span><b>{index + 1}</b>{instruction}</span>
                </label>
              ))}
              <button className="employee-primary" disabled={!checks.every(Boolean)} onClick={() => setStep("completed")}>Uitvoering afronden</button>
            </div>
          )}

          {step === "completed" && (
            <div className="employee-completed">
              <span>✓</span><h3>Conversie uitgevoerd</h3><p>{orderReference} · {model}</p>
              <div><strong>Volgende stap</strong>Kwaliteitscontrole en vrijgave voor verzending.</div>
              <button className="employee-primary" onClick={reset}>Volgende laptop</button>
            </div>
          )}
        </section>

        <aside className="employee-side">
          <section className="panel quick-stock">
            <span className="workspace-kicker">SNEL AFBOEKEN</span><h3>Scan gebruikt stickervel</h3><p>Voor handmatige afboeking buiten een conversieorder.</p>
            <input value={scanSku} onChange={(event) => { setScanSku(event.target.value); setStockMessage(""); }} placeholder="Scan of vul SKU in…" />
            <button onClick={quickIssue}>−1 voorbereiden</button>
            {stockMessage && <div className="stock-feedback">{stockMessage}</div>}
          </section>
          <section className="panel employee-queue">
            <div><span className="workspace-kicker">MIJN WACHTRIJ</span><b>3 open</b></div>
            {[
              ["ORD-1859", "Dell Latitude 5420", "AZERTY FR"],
              ["ORD-1861", "HP EliteBook 850 G7", "QWERTY US"],
              ["ORD-1864", "HP ZBook 15 G3", "QWERTZ DE"],
            ].map(([order, laptop, layout]) => <button key={order}><span><strong>{order}</strong><small>{laptop}</small></span><b>{layout}</b></button>)}
          </section>
          <section className="employee-help">
            <strong>Probleem of twijfel?</strong><p>Stop de uitvoering en vraag een teamleider. Afwijken van het advies vereist managementtoestemming.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function stepNumber(step: WorkStep) {
  return { input: 1, advice: 2, execution: 3, completed: 4 }[step];
}

function stepTitle(step: WorkStep) {
  return {
    input: "Vul de laptopgegevens in",
    advice: "Controleer het advies",
    execution: "Volg de werkinstructies",
    completed: "Uitvoering afgerond",
  }[step];
}
