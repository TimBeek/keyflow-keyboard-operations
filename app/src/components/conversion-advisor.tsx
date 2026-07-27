"use client";

import { useMemo, useState } from "react";
import {
  methodLabel,
  recommendConversion,
  type ConversionMethodId,
} from "@/domain/conversion-policy";

type Props = {
  open: boolean;
  onClose: () => void;
};

const methodOptions: { id: Exclude<ConversionMethodId, "none">; short: string }[] = [
  { id: "loose_stickers", short: "Losse stickers" },
  { id: "noviply_sheet", short: "Noviply voorraadvel" },
  { id: "printed_sticker", short: "Sterke printsticker" },
  { id: "direct_reprint", short: "Directe keyboardprint" },
];

const layouts = ["QWERTY US", "AZERTY FR", "QWERTZ DE", "QWERTY UK", "QWERTY ES", "QWERTY IT"];

export function ConversionAdvisor({ open, onClose }: Props) {
  const [saleValue, setSaleValue] = useState(349);
  const [currentLayout, setCurrentLayout] = useState("AZERTY FR");
  const [targetLayout, setTargetLayout] = useState("QWERTY US");
  const [workload, setWorkload] = useState<"normal" | "busy" | "critical">("normal");
  const [available, setAvailable] = useState({
    loose_stickers: true,
    noviply_sheet: true,
    printed_sticker: true,
    direct_reprint: true,
  });
  const [step, setStep] = useState<"input" | "result">("input");

  const recommendation = useMemo(
    () =>
      recommendConversion({
        saleValueEur: saleValue,
        thresholdEur: 300,
        currentLayout,
        targetLayout,
        workload,
        available,
        compatible: {
          loose_stickers: true,
          noviply_sheet: true,
          printed_sticker: true,
          direct_reprint: true,
        },
      }),
    [available, currentLayout, saleValue, targetLayout, workload],
  );

  if (!open) return null;

  function close() {
    setStep("input");
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="advisor-modal" role="dialog" aria-modal="true" aria-labelledby="advisor-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">NIEUWE CONVERSIE</span>
            <h2 id="advisor-title">Kies de beste keyboardmethode</h2>
            <p>Het advies volgt beleidsversie 1 · grens €300</p>
          </div>
          <button className="close-button" onClick={close} aria-label="Sluiten">×</button>
        </header>

        {step === "input" ? (
          <>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  <span>Laptop-ID of order</span>
                  <input placeholder="Scan of vul referentie in" autoFocus />
                </label>
                <label>
                  <span>Verkoopwaarde</span>
                  <div className="money-input"><b>€</b><input type="number" min="0" value={saleValue} onChange={(event) => setSaleValue(Number(event.target.value))} /></div>
                </label>
                <label>
                  <span>Huidige layout</span>
                  <select value={currentLayout} onChange={(event) => setCurrentLayout(event.target.value)}>
                    {layouts.map((layout) => <option key={layout}>{layout}</option>)}
                  </select>
                </label>
                <label>
                  <span>Gewenste klantlayout</span>
                  <select value={targetLayout} onChange={(event) => setTargetLayout(event.target.value)}>
                    {layouts.map((layout) => <option key={layout}>{layout}</option>)}
                  </select>
                </label>
                <label className="full-field">
                  <span>Actuele werkdruk</span>
                  <div className="segmented">
                    {([
                      ["normal", "Normaal"],
                      ["busy", "Druk"],
                      ["critical", "Kritiek"],
                    ] as const).map(([value, label]) => (
                      <button type="button" key={value} className={workload === value ? "selected" : ""} onClick={() => setWorkload(value)}>{label}</button>
                    ))}
                  </div>
                </label>
              </div>

              <fieldset className="availability">
                <legend>Nu beschikbaar</legend>
                <p>Zet een methode uit bij materiaaltekort, storing of ontbrekende capaciteit.</p>
                <div>
                  {methodOptions.map((method) => (
                    <label key={method.id}>
                      <input
                        type="checkbox"
                        checked={available[method.id]}
                        onChange={(event) => setAvailable({ ...available, [method.id]: event.target.checked })}
                      />
                      <span><b>{method.short}</b><small>{available[method.id] ? "Beschikbaar" : "Niet beschikbaar"}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <footer className="modal-footer">
              <button className="secondary-button" onClick={close}>Annuleren</button>
              <button className="primary-button" onClick={() => setStep("result")}>Bereken advies</button>
            </footer>
          </>
        ) : (
          <>
            <div className="modal-body result-body">
              <div className={`recommendation-hero ${recommendation.primary === "none" ? "blocked" : ""}`}>
                <span className="recommendation-label">GEADVISEERDE METHODE</span>
                <h3>{methodLabel(recommendation.primary)}</h3>
                <p>{recommendation.reason}</p>
                <span className="rule-chip">Regel: {recommendation.policy.rule.replaceAll("_", " ")}</span>
              </div>

              {recommendation.warnings.length > 0 && (
                <div className="warning-list">
                  <strong>Aandachtspunten</strong>
                  {recommendation.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}

              {recommendation.alternatives.length > 0 && (
                <div className="alternatives">
                  <strong>Toegestane alternatieven</strong>
                  <div>
                    {recommendation.alternatives.map((method, index) => (
                      <span key={method}>{index + 2}. {methodLabel(method)}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="decision-summary">
                <div><span>Waarde</span><b>€ {saleValue.toLocaleString("nl-NL")}</b></div>
                <div><span>Van</span><b>{currentLayout}</b></div>
                <div><span>Naar</span><b>{targetLayout}</b></div>
                <div><span>Werkdruk</span><b>{workload}</b></div>
              </div>
            </div>
            <footer className="modal-footer">
              <button className="secondary-button" onClick={() => setStep("input")}>Gegevens wijzigen</button>
              <button className="primary-button" disabled={recommendation.primary === "none"}>Conversieorder aanmaken</button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
