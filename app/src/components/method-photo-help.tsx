"use client";

import { useEffect, useRef } from "react";
import type { ConversionMethodId } from "@/domain/conversion-policy";
import { methodStars } from "@/domain/conversion-policy";
import { allMethodPhotos } from "@/domain/method-photos";

/**
 * De vier niveaus met een foto erbij.
 *
 * Op de werkvloer staat er een niveau op het scherm en ligt er een vel op
 * tafel, en de vraag is dan altijd dezelfde: is dít wat er bedoeld wordt. Met
 * alleen "Noviply Voorraadstickers · ★★" moet je dat uit je hoofd weten. Met een
 * foto ernaast kijk je gewoon.
 *
 * Het niveau waar je op dat moment mee bezig bent staat vooraan en is
 * gemarkeerd, zodat je bij het openen niet eerst hoeft te zoeken. De andere
 * drie blijven zichtbaar — juist het verschil ertussen is wat je wilt zien.
 */
export function MethodPhotoHelp({
  huidig,
  onClose,
}: {
  huidig: ConversionMethodId | null;
  onClose: () => void;
}) {
  const basis = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const fotos = allMethodPhotos(basis);
  const panel = useRef<HTMLDivElement>(null);
  const eigen = useRef<HTMLElement>(null);

  // Escape sluit, zoals bij elk ander venster in de app.
  useEffect(() => {
    const opToets = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", opToets);
    return () => window.removeEventListener("keydown", opToets);
  }, [onClose]);

  // Open je dit vanaf een advies, dan hoort dat niveau meteen in beeld te
  // staan; anders scrol je op een telefoon eerst langs drie andere foto's.
  useEffect(() => {
    if (eigen.current) {
      eigen.current.scrollIntoView({ block: "nearest" });
    } else {
      panel.current?.focus();
    }
  }, []);

  return (
    <div
      className="ster-help"
      role="dialog"
      aria-modal="true"
      aria-label="De vier niveaus, met foto"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ster-help-panel" ref={panel} tabIndex={-1}>
        <div className="ster-help-head">
          <div>
            <h3>Wat krijg je bij welk niveau?</h3>
            <p>Hoe hoger het niveau, hoe steviger de oplossing — en hoe langer hij duurt.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        <div className="ster-help-lijst">
          {fotos.map((foto) => {
            const ditIsHet = foto.method === huidig;
            return (
              <article
                key={foto.method}
                ref={ditIsHet ? eigen : undefined}
                className={`ster-help-item${ditIsHet ? " is-huidig" : ""}`}
                aria-current={ditIsHet ? "true" : undefined}
              >
                <div className="ster-help-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto.groot}
                    alt={foto.alt}
                    width={foto.breedte}
                    height={foto.hoogte}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="ster-help-tekst">
                  <p className="ster-help-niveau">
                    <span className="method-stars" aria-hidden="true">{methodStars(foto.method)}</span>
                    <span className="sr-only">Niveau {foto.niveau} van 4.</span>
                    {ditIsHet && <span className="ster-help-vlag">Dit is jouw advies</span>}
                  </p>
                  <h4>{foto.naam}</h4>
                  <p className="ster-help-wat">{foto.onderschrift}</p>
                  <p className="ster-help-herkomst">{foto.herkomst}</p>
                  {foto.leverancier && (
                    <p className="ster-help-leverancier">
                      <span>Leverancier</span> <b>{foto.leverancier}</b>
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="ster-help-voet">
          <button type="button" className="primary-button" onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
