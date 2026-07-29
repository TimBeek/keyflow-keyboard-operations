"use client";

import { useMemo, useState } from "react";
import {
  calculateInventoryMutation,
  InventoryRuleError,
} from "@/domain/inventory";

export type InventoryItem = {
  catalogKey?: string;
  storageNumber?: number;
  model: string;
  sku: string;
  layout: string;
  stock: number;
  /** Null zolang er geen gemeten verbruik is om een minimum uit af te leiden. */
  threshold: number | null;
};

type Props = {
  open: boolean;
  mode: "issue" | "receipt";
  item: InventoryItem;
  onClose: () => void;
  onConfirm: (newQuantity: number, quantityDelta: number) => void;
};

export function InventoryMutationDialog({ open, mode, item, onClose, onConfirm }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [reasonCode, setReasonCode] = useState(mode === "issue" ? "refurbish_usage" : "supplier_delivery");
  const [notes, setNotes] = useState("");

  const calculation = useMemo(() => {
    try {
      return {
        result: calculateInventoryMutation({
          sku: item.sku,
          currentQuantity: item.stock,
          type: mode,
          quantity,
          reasonCode,
          notes,
          idempotencyKey: `preview-${item.sku}-${mode}`,
        }),
        error: "",
      };
    } catch (error) {
      return {
        result: null,
        error: error instanceof InventoryRuleError ? error.message : "Controleer de invoer.",
      };
    }
  }, [item.sku, item.stock, mode, notes, quantity, reasonCode]);

  if (!open) return null;

  function confirm() {
    if (!calculation.result) return;
    onConfirm(calculation.result.newQuantity, calculation.result.quantityDelta);
    setQuantity(1);
    setNotes("");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="mutation-modal" role="dialog" aria-modal="true" aria-labelledby="mutation-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">{mode === "issue" ? "VOORRAAD AFBOEKEN" : "VOORRAAD ONTVANGEN"}</span>
            <h2 id="mutation-title">{item.model}</h2>
            <p>{item.sku} · {item.layout}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Sluiten">×</button>
        </header>
        <div className="modal-body">
          <div className="balance-preview">
            <div><span>Huidig</span><b>{item.stock}</b></div>
            <strong>{mode === "issue" ? "−" : "+"}</strong>
            <div><span>Aantal</span><b>{quantity}</b></div>
            <strong>=</strong>
            <div className={calculation.error ? "invalid" : ""}><span>Nieuw</span><b>{calculation.result?.newQuantity ?? "—"}</b></div>
          </div>

          <div className="mutation-form">
            <label>
              <span>Aantal</span>
              <div className="stepper">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Eén minder">−</button>
                <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
                <button onClick={() => setQuantity(quantity + 1)} aria-label="Eén meer">+</button>
              </div>
            </label>
            <label>
              <span>Reden</span>
              <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
                {mode === "issue" ? (
                  <>
                    <option value="refurbish_usage">Gebruikt voor refurbish</option>
                    <option value="quality_scrap">Kwaliteitsuitval</option>
                    <option value="sample">Test of sample</option>
                  </>
                ) : (
                  <>
                    <option value="supplier_delivery">Levering leverancier</option>
                    <option value="return">Retour ontvangen</option>
                    <option value="opening_count">Openings-/telsaldo</option>
                  </>
                )}
              </select>
            </label>
            <label className="full-field">
              <span>Opmerking <i>optioneel</i></span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Order, pakbon of bijzonderheid…" />
            </label>
          </div>

          {calculation.error && <div className="form-error">{calculation.error}</div>}
          {calculation.result?.requiresApproval && <div className="approval-note">Deze mutatie is groot of afwijkend en vereist later goedkeuring door een voorraadbeheerder.</div>}
          <p className="audit-preview">Bij bevestigen worden gebruiker, datum/tijd, reden en een unieke transactiesleutel geregistreerd.</p>
        </div>
        <footer className="modal-footer">
          <button className="secondary-button" onClick={onClose}>Annuleren</button>
          <button className="primary-button" disabled={!calculation.result} onClick={confirm}>
            {mode === "issue" ? `${quantity} afboeken` : `${quantity} ontvangen`}
          </button>
        </footer>
      </section>
    </div>
  );
}
