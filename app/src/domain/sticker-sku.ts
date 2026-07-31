/**
 * Het artikelnummer van een stickervel: NB + volgnummer + entervorm + land,
 * bijvoorbeeld NB10052E1NL. De Excel-import levert soms lege regels of resten
 * als ",,,,,,,,,," op; die mogen nooit als nummer worden getoond.
 */
/**
 * NB is van Noviply en staat op het vel. RM is van onszelf: dat kennen we toe
 * aan een hangmap waar geen nummer bij stond, zodat de map toch bruikbaar is.
 * Aan de letters zie je meteen of je het bij Noviply kunt bestellen.
 */
export const stickerSkuPattern = /^(NB|RM)\d+E\d+(NL|FR|DE|BE|UK|SE|NO|DK|ES|IT|PT|PL)$/;

export function isOwnStickerSku(sku: string) {
  return sku.trim().toUpperCase().startsWith("RM");
}

export function isValidStickerSku(sku: string) {
  return stickerSkuPattern.test(sku.trim().toUpperCase());
}

export function normalizeStickerSku(sku: string) {
  return sku.trim().toUpperCase();
}

/** Wat de gebruiker leest als er geen bruikbaar nummer is. */
export const missingSkuLabel = "Geen artikelnummer";

export function displayStickerSku(sku: string) {
  return isValidStickerSku(sku) ? normalizeStickerSku(sku) : missingSkuLabel;
}

export class StickerSkuError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StickerSkuError";
  }
}

/** Controleert een handmatig ingevoerd nummer voordat het wordt bewaard. */
export function validateStickerSkuInput(sku: string) {
  const normalized = normalizeStickerSku(sku);
  if (!normalized) {
    throw new StickerSkuError("Vul een artikelnummer in.");
  }
  if (!isValidStickerSku(normalized)) {
    throw new StickerSkuError(
      "Een artikelnummer ziet eruit als NB10052E1NL: NB, cijfers, de entervorm en het land.",
    );
  }
  return normalized;
}
