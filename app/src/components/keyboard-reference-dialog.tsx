"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  scandinavianLayoutReferences,
  type ScandinavianLayoutReference,
} from "@/domain/keyboard-layouts";

export type KeyboardReferenceTopic = "fit" | "scandinavian" | "dutch-us";

type Props = {
  open: boolean;
  topic: KeyboardReferenceTopic;
  currentLayout: string;
  targetLayout: string;
  expectedVariant?: string | null;
  expectedSku?: string;
  onClose: () => void;
  onTopicChange: (topic: KeyboardReferenceTopic) => void;
  onChooseCurrentLayout: (layout: string) => void;
};

const fitCheckpoints = [
  ["Enter", "Controleer vorm, hoogte en uitsparing."],
  ["Shift links én rechts", "Vergelijk beide breedtes en omliggende toetsen."],
  ["Pijltjestoetsen", "Controleer cluster, hoogte en tussenruimte."],
  ["Functierij", "Vergelijk aantal, maat en onderlinge afstand."],
  ["Numpad", "Controleer of het model wel of geen numeriek deel heeft."],
  ["Pointing stick", "Controleer de uitsparing bij modellen met een trackpoint."],
];

const fitVariantReferences = [
  {
    variant: "E1",
    image: "/keyboard-reference-e1-dell-v2.png",
    tone: "e1",
    label: "Blauwe controleweergave",
    explanation: "Controleer of E1 letterlijk in het exacte SKU-label staat.",
  },
  {
    variant: "E2",
    image: "/keyboard-reference-e2-dell-v2.png",
    tone: "e2",
    label: "Oranje controleweergave",
    explanation: "Controleer of E2 letterlijk in het exacte SKU-label staat.",
  },
] as const;

export function KeyboardReferenceDialog({
  open,
  topic,
  currentLayout,
  targetLayout,
  expectedVariant,
  expectedSku,
  onClose,
  onTopicChange,
  onChooseCurrentLayout,
}: Props) {
  const [selectedReference, setSelectedReference] = useState<ScandinavianLayoutReference | null>(null);
  const [failedFitImages, setFailedFitImages] = useState<string[]>([]);
  const [fitImageRetries, setFitImageRetries] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  const orderedFitVariantReferences = expectedVariant
    ? [...fitVariantReferences].sort((left, right) =>
        Number(right.variant === expectedVariant.toUpperCase())
        - Number(left.variant === expectedVariant.toUpperCase()))
    : fitVariantReferences;

  return (
    <div className="modal-backdrop keyboard-reference-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="keyboard-reference-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-reference-title"
      >
        <header className="keyboard-reference-header">
          <div>
            <span className="workspace-kicker">WERKNEMERSREFERENTIE</span>
            <h2 id="keyboard-reference-title">Keyboard layout & E1/E2-gids</h2>
            <p>Vergelijk eerst visueel en fysiek. Kies nooit alleen op basis van de naam.</p>
          </div>
          <button type="button" className="reference-close" onClick={onClose} aria-label="Referentiegids sluiten">×</button>
        </header>

        <div className="reference-current-selection">
          <div><span>Huidige layout</span><strong>{currentLayout}</strong></div>
          <span aria-hidden="true">→</span>
          <div><span>Gewenste layout</span><strong>{targetLayout}</strong></div>
        </div>

        <nav className="reference-tabs" aria-label="Onderwerpen in keyboardreferentie">
          <button type="button" className={topic === "fit" ? "active" : ""} onClick={() => onTopicChange("fit")}>E1/E2 & pasvorm</button>
          <button type="button" className={topic === "scandinavian" ? "active" : ""} onClick={() => onTopicChange("scandinavian")}>Scandinavische layouts</button>
          <button type="button" className={topic === "dutch-us" ? "active" : ""} onClick={() => onTopicChange("dutch-us")}>NL vs US International</button>
        </nav>

        <div className="keyboard-reference-body">
          {topic === "fit" ? (
            <>
              <div className="reference-safety-note">
                <strong>E1/E2 is een artikelvariant, geen taalkeuze</strong>
                <p>Noviply beschrijft de stickers als model- en taalspecifiek. Behandel E1/E2 daarom niet als een universele toetsvormregel: het SKU-etiket, het gevalideerde laptopmodel en een droge fysieke uitlijning zijn leidend.</p>
              </div>
              {expectedVariant && (
                <div className="expected-variant-banner">
                  <span>DEZE UITVOERING VRAAGT</span>
                  <strong>{expectedVariant}</strong>
                  <p>{expectedSku ? `Controleer het volledige label: ${expectedSku}` : "Controleer het volledige SKU-label op het vel."}</p>
                </div>
              )}
              <div className="fit-variant-grid">
                {orderedFitVariantReferences.map((reference) => {
                  const isExpected = expectedVariant?.toUpperCase() === reference.variant;
                  const imageFailed = failedFitImages.includes(reference.image);
                  const retryNumber = fitImageRetries[reference.image] ?? 0;
                  const imageSource = retryNumber > 0
                    ? `${reference.image}?retry=${retryNumber}`
                    : reference.image;
                  return (
                    <article
                      className={`fit-variant-card ${reference.tone}${isExpected ? " expected" : ""}`}
                      key={reference.variant}
                    >
                      <div className="fit-variant-heading">
                        <div>
                          <span>DELL TRAININGSBEELD</span>
                          <strong>{reference.variant}</strong>
                        </div>
                        <b>{isExpected ? "Verwacht voor deze order" : reference.label}</b>
                      </div>
                      <figure>
                        {imageFailed ? (
                          <div className="fit-image-fallback" role="alert">
                            <strong>Referentiebeeld niet geladen</strong>
                            <span>Gebruik dit beeld niet voor de controle. Probeer opnieuw of stop zonder afboeken.</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFailedFitImages((current) =>
                                  current.filter((image) => image !== reference.image));
                                setFitImageRetries((current) => ({
                                  ...current,
                                  [reference.image]: retryNumber + 1,
                                }));
                              }}
                            >
                              Opnieuw laden
                            </button>
                          </div>
                        ) : (
                          <Image
                            key={imageSource}
                            src={imageSource}
                            width={1672}
                            height={941}
                            sizes="(max-width: 760px) 92vw, 430px"
                            alt={`Dell Latitude-stijl toetsenbord met ${reference.tone === "e1" ? "blauwe" : "oranje"} illustratieve ${reference.variant}-controleoverlay rond Enter, Shift, functierij, pijltjes en pointing stick`}
                            loading="eager"
                            onError={() => setFailedFitImages((current) =>
                              current.includes(reference.image)
                                ? current
                                : [...current, reference.image])}
                          />
                        )}
                      </figure>
                      <div className="fit-variant-copy">
                        <strong>{reference.explanation}</strong>
                        <span>De kleur helpt alleen deze gids leesbaar te maken en komt niet van het echte productlabel.</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="variant-difference-explainer">
                <strong>Waar zie je het verschil in deze gids?</strong>
                <p>E1 gebruikt een doorgetrokken blauwe controlecontour. E2 gebruikt een oranje contour met extra stippellijn rond de kritieke uitsneden. Dit maakt de twee trainingsbeelden direct herkenbaar; het bewijst niet dat ieder E1- of E2-vel overal dezelfde fysieke vorm heeft.</p>
              </div>
              <div className="fit-checkpoint-grid">
                {fitCheckpoints.map(([title, explanation], index) => (
                  <article key={title}>
                    <b>{index + 1}</b>
                    <div><strong>{title}</strong><span>{explanation}</span></div>
                  </article>
                ))}
              </div>
              <div className="reference-decision-grid">
                <article><span>E1 / E2 controleren</span><strong>Lees de variant uit het exacte SKU-label</strong><p>Wissel E1 en E2 nooit zelf om omdat een modelnaam ongeveer overeenkomt.</p></article>
                <article><span>Droge pastest</span><strong>Laat de drager en kleeflaag intact</strong><p>Lijn alle randen, toetsen en uitsparingen uit vóórdat je toestemming geeft om aan te brengen.</p></article>
                <article className="stop"><span>Bij twijfel</span><strong>Stop zonder afboeken</strong><p>Meld “variant” of “positionering” en laat een teamleider de combinatie valideren.</p></article>
              </div>
              <div className="reference-source-note">
                <p><strong>Broncontrole:</strong> Noviply noemt de keyboardstickers model-specifiek en exact passend. Gebruik de beelden daarom als controlehulp, nooit als vervanging van het echte SKU-label.</p>
                <div>
                  <a href="https://noviply.com/laptop-keyboard-sticker/" target="_blank" rel="noreferrer">Officiële Noviply productuitleg ↗</a>
                </div>
              </div>
            </>
          ) : topic === "scandinavian" ? (
            <>
              <div className="reference-safety-note nordic">
                <strong>Herken eerst de letterset, controleer daarna de symbooltoetsen</strong>
                <p>Zweeds/Fins, Noors en Deens zijn afzonderlijke layouts. Noors en Deens delen Å, Æ en Ø; onderscheid die twee dus niet op alleen deze drie letters.</p>
              </div>
              <div className="scandinavian-reference-grid">
                {scandinavianLayoutReferences.map((reference) => (
                  <article className={selectedReference?.value === reference.value ? "selected" : ""} key={reference.value}>
                    <span>{reference.value}</span>
                    <h3>{reference.shortLabel}</h3>
                    <strong className="key-symbols">{reference.keySymbols}</strong>
                    <p>{reference.recognition}</p>
                    <small>{reference.caution}</small>
                    <button type="button" onClick={() => setSelectedReference(reference)}>Bekijk keuze</button>
                  </article>
                ))}
              </div>
              {selectedReference && (
                <div className="layout-choice-confirmation">
                  <div>
                    <span>GEKOZEN REFERENTIE</span>
                    <strong>{selectedReference.shortLabel} · {selectedReference.keySymbols}</strong>
                    <p>{selectedReference.caution}</p>
                  </div>
                  <button type="button" className="employee-primary" onClick={() => {
                    onChooseCurrentLayout(selectedReference.value);
                    onClose();
                  }}>Gebruik als huidige layout</button>
                </div>
              )}
              <div className="reference-source-note">
                <p><strong>Merk- en modelwaarschuwing:</strong> toetsposities kunnen per fabrikant en model afwijken. Gebruik een goedgekeurde model- of leveranciersfoto als definitieve vergelijking.</p>
                <div>
                  <a href="https://support.apple.com/en-nz/102743" target="_blank" rel="noreferrer">Officiële visuele layoutvoorbeelden ↗</a>
                  <a href="https://noviply.com/laptop-keyboard-sticker/" target="_blank" rel="noreferrer">Noviply model- en taalstickers ↗</a>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="reference-safety-note dutch-us">
                <strong>Nederlands QWERTY en US International zijn niet automatisch hetzelfde</strong>
                <p>De iUsed-vergelijking toont herkenningspunten op MacBooks. Gebruik ze als visuele aanwijzing en controleer daarna altijd fabrikant, model en goedgekeurde referentiefoto.</p>
              </div>
              <div className="dutch-us-comparison">
                <article>
                  <span>QWERTY US / US INTERNATIONAL</span>
                  <div className="enter-key horizontal">Enter ↵</div>
                  <h3>Horizontale Enter/Return</h3>
                  <ul>
                    <li>bredere Shift-toets;</li>
                    <li>backslash rechtsboven de Enter;</li>
                    <li>tilde/grave doorgaans boven de Tab.</li>
                  </ul>
                  <button type="button" onClick={() => {
                    onChooseCurrentLayout("QWERTY US");
                    onClose();
                  }}>Gebruik US International als huidige layout</button>
                </article>
                <article>
                  <span>QWERTY NL / NEDERLANDS</span>
                  <div className="enter-key vertical">Return<br />↵</div>
                  <h3>Verticale Return</h3>
                  <ul>
                    <li>backslash linksonder de Return;</li>
                    <li>€-teken als opdruk boven de 2;</li>
                    <li>kleinere Shift met tilde/grave ernaast.</li>
                  </ul>
                  <button type="button" onClick={() => {
                    onChooseCurrentLayout("QWERTY NL");
                    onClose();
                  }}>Gebruik Nederlands als huidige layout</button>
                </article>
              </div>
              <div className="reference-source-note">
                <p><strong>Let op:</strong> software-instellingen en fysieke keycaps zijn twee verschillende zaken. Registreer wat fysiek op de laptop aanwezig is.</p>
                <div>
                  <a href="https://www.iused.be/en/blog/the-difference-between-dutch-and-us-int-qwerty" target="_blank" rel="noreferrer">iUsed-vergelijking NL en US Int. ↗</a>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
