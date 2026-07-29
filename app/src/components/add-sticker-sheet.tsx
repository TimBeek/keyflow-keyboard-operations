"use client";

import { useEffect, useState } from "react";
import { targetLayoutOptions } from "@/domain/keyboard-layouts";
import {
  addStickerSheet,
  fetchNextStorageNumber,
  KeyflowApiError,
} from "@/lib/keyflow-api";

/**
 * Een nieuw stickervel in de voorraad zetten.
 *
 * De hangmappen kwamen uit de Excel, maar er komen modellen bij. Zonder dit
 * moest je wachten op een nieuwe import — of het vel belandde buiten het
 * systeem om in een hangmap, en dan klopt de voorraad niet meer.
 */
export function AddStickerSheetDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [storageNumber, setStorageNumber] = useState("");
  const [sku, setSku] = useState("");
  const [model, setModel] = useState("");
  const [layout, setLayout] = useState(targetLayoutOptions[0]?.value ?? "QWERTY NL");
  const [quantity, setQuantity] = useState("0");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        // Het eerste vrije nummer voorstellen, zodat niemand hoeft te zoeken.
        const { nextStorageNumber } = await fetchNextStorageNumber();
        if (cancelled) return;
        setStorageNumber(String(nextStorageNumber));
        setError("");
        setDone("");
      } catch {
        if (!cancelled) setError("Het eerstvolgende hangmapnummer kon niet worden opgehaald.");
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const ready = Number(storageNumber) > 0 && sku.trim().length > 4 && model.trim().length > 1;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await addStickerSheet({
        storageNumber: Number(storageNumber),
        sku: sku.trim(),
        model: model.trim(),
        layout,
        quantity: Number(quantity) || 0,
        notes: notes.trim(),
        idempotencyKey: `sheet-${crypto.randomUUID()}`,
      });
      setDone(`Hangmap ${result.storageNumber} aangemaakt voor ${result.sku}.`);
      setSku("");
      setModel("");
      setNotes("");
      setQuantity("0");
      const { nextStorageNumber } = await fetchNextStorageNumber();
      setStorageNumber(String(nextStorageNumber));
      onAdded();
    } catch (caught) {
      setError(caught instanceof KeyflowApiError ? caught.message : "Toevoegen is niet gelukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Stickervel toevoegen">
      <div className="unlock-modal sheet-modal">
        <div className="modal-head">
          <h2>Stickervel toevoegen</h2>
          <button onClick={onClose} aria-label="Sluiten">×</button>
        </div>
        <div className="modal-body">
          <p className="unlock-intro">
            Voor een model dat nog geen hangmap heeft. Het aantal is wat er nú fysiek
            in de hangmap ligt — dat telt als beginstand, niet als levering.
          </p>

          <div className="sheet-grid">
            <label>
              <span>Hangmap</span>
              <input
                type="number"
                min="1"
                value={storageNumber}
                onChange={(event) => { setStorageNumber(event.target.value); setError(""); }}
              />
            </label>
            <label>
              <span>Artikelnummer</span>
              <input
                value={sku}
                placeholder="NB10250E1NL"
                maxLength={64}
                onChange={(event) => { setSku(event.target.value.toUpperCase()); setError(""); }}
              />
            </label>
          </div>

          <label className="sheet-field">
            <span>Laptopmodel</span>
            <input
              value={model}
              placeholder="Dell Latitude 5450"
              maxLength={200}
              onChange={(event) => { setModel(event.target.value); setError(""); }}
            />
          </label>

          <div className="sheet-grid">
            <label>
              <span>Taal</span>
              <select value={layout} onChange={(event) => setLayout(event.target.value)}>
                {targetLayoutOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Aantal nu in de hangmap</span>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
          </div>

          <label className="sheet-field">
            <span>Notitie (mag leeg)</span>
            <input
              value={notes}
              maxLength={300}
              placeholder="bijvoorbeeld: nieuw model, eerste levering"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {error && <p className="form-error">{error}</p>}
          {done && <p className="policy-saved" role="status">{done}</p>}
        </div>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>Sluiten</button>
          <button className="primary-button" disabled={!ready || busy} onClick={() => void save()}>
            {busy ? "Toevoegen…" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
