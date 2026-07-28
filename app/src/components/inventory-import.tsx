"use client";

import { useRef, useState } from "react";

type ImportResult = {
  batchId: string;
  status: "needs_review" | "ready";
  recordCount: number;
  totalQuantity: number;
  errorCount: number;
  warningCount: number;
  reviewCount: number;
  duplicate: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onReview: (batchId: string) => void;
};

export function InventoryImportDialog({ open, onClose, onReview }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  function reset() {
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  function review(batchId: string) {
    reset();
    onClose();
    onReview(batchId);
  }

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/imports/inventory", {
        method: "POST",
        body: form,
      });
      const body = await response.json() as ImportResult & { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? "De voorraadimport is niet gelukt.");
      }
      setResult(body);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "De voorraadimport is niet gelukt.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="modal-header">
          <div>
            <span className="modal-kicker">EXCEL-VOORRAADIMPORT</span>
            <h2 id="import-title">Voorraadbestand controleren</h2>
            <p>De upload wordt eerst gecontroleerd en verandert de live voorraad nog niet.</p>
          </div>
          <button className="close-button" onClick={close} aria-label="Sluiten">×</button>
        </header>

        {!result ? (
          <div className="modal-body">
            <button className={`file-dropzone ${file ? "selected" : ""}`} onClick={() => inputRef.current?.click()}>
              <span className="file-symbol">XLSX</span>
              <strong>{file?.name ?? "Kies Toetsenbordstickers voorraad.xlsx"}</strong>
              <small>
                {file
                  ? `${(file.size / 1024).toLocaleString("nl-NL", { maximumFractionDigits: 0 })} KB · klaar om te controleren`
                  : "Alleen .xlsx, maximaal 10 MB"}
              </small>
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError("");
              }}
            />
            <div className="import-safety">
              <strong>Wat gebeurt er bij uploaden?</strong>
              <span>1. Alle 148 regels worden afzonderlijk bewaard.</span>
              <span>2. SKU’s, aantallen, layouts en compatibiliteit worden gecontroleerd.</span>
              <span>3. Fouten en mogelijke dubbelen gaan eerst naar beoordeling.</span>
            </div>
            <button className="demo-review-link" onClick={() => review("demo")}>
              Bekijk eerst de 43 bevindingen uit het huidige bronbestand
            </button>
            {error && <div className="form-error">{error}</div>}
          </div>
        ) : (
          <div className="modal-body import-result">
            <div className={`import-result-banner ${result.status}`}>
              <span>{result.status === "ready" ? "KLAAR VOOR VERWERKING" : "BEOORDELING NODIG"}</span>
              <h3>{result.duplicate ? "Dit bestand was al geüpload" : "Excel-bestand is veilig opgeslagen"}</h3>
              <p>
                {result.status === "ready"
                  ? "Er zijn geen blokkerende fouten of mogelijke dubbelen gevonden."
                  : "De live voorraad blijft ongewijzigd totdat de bevindingen zijn beoordeeld."}
              </p>
            </div>
            <div className="import-metrics">
              <div><span>Regels</span><strong>{result.recordCount}</strong></div>
              <div><span>Voorraad</span><strong>{result.totalQuantity.toLocaleString("nl-NL")}</strong></div>
              <div className={result.errorCount ? "metric-error" : ""}><span>Fouten</span><strong>{result.errorCount}</strong></div>
              <div className={result.warningCount ? "metric-warning" : ""}><span>Waarschuwingen</span><strong>{result.warningCount}</strong></div>
              <div className={result.reviewCount ? "metric-review" : ""}><span>Dubbelen</span><strong>{result.reviewCount}</strong></div>
            </div>
            <p className="batch-reference">Importreferentie: <code>{result.batchId}</code></p>
          </div>
        )}

        <footer className="modal-footer">
          {result ? (
            <>
              <button className="secondary-button" onClick={reset}>Ander bestand</button>
              {result.status === "needs_review" ? (
                <button className="primary-button" onClick={() => review(result.batchId)}>Bevindingen bekijken</button>
              ) : (
                <button className="primary-button" onClick={close}>Sluiten</button>
              )}
            </>
          ) : (
            <>
              <button className="secondary-button" onClick={close}>Annuleren</button>
              <button className="primary-button" disabled={!file || uploading} onClick={upload}>
                {uploading ? "Controleren…" : "Uploaden en controleren"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
