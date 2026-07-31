"use client";

import { useState } from "react";

/**
 * Het logo van Noviply, boven hun eigen werkscherm.
 *
 * Het bestand hoort in public/noviply-logo.svg (of .png) te staan en komt van
 * Noviply zelf. Bewust niet nagetekend: een merk natekenen levert altijd
 * verkeerde verhoudingen en een verkeerd lettertype op, en het is hun merk —
 * dat hoor je te gebruiken zoals zij het aanleveren.
 *
 * Zolang het bestand er niet is staat hun naam er in onze eigen letters. Dat
 * ziet er verzorgd uit en valt niemand op als een gat; zodra het bestand er
 * staat neemt het logo die plek over zonder dat er verder iets hoeft te
 * gebeuren.
 */
export function NoviplyLogo() {
  const [gevonden, setGevonden] = useState(true);
  const basis = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <div className="noviply-logo">
      {gevonden ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${basis}/noviply-logo.svg`}
          alt="Noviply"
          onError={() => setGevonden(false)}
        />
      ) : (
        <span className="noviply-logo-naam">Noviply</span>
      )}
      <span className="noviply-logo-rol">Printing partner</span>
    </div>
  );
}
