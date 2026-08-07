"use client";

/**
 * Een bestand aanbieden zonder het ergens neer te zetten.
 *
 * Deze functie stond in het Noviply-scherm, waar hij prima werkte tot het
 * beheerscherm hetzelfde nodig had. Twee keer dezelfde vijf regels is twee keer
 * dezelfde regels om te onderhouden, en dan lopen ze vroeg of laat uiteen —
 * meestal op het punt waar één van de twee een randgeval oploste.
 *
 * De URL wordt meteen weer vrijgegeven. Zonder dat blijft het bestand in het
 * geheugen van het tabblad staan, en op een scherm dat de hele dag openstaat
 * loopt dat op.
 */
export function downloadTekstbestand(
  inhoud: string,
  bestandsnaam: string,
  type = "text/csv;charset=utf-8",
) {
  const blob = new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = bestandsnaam;
  link.click();
  URL.revokeObjectURL(url);
}
