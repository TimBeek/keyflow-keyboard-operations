/**
 * Het knopje midden op het toetsenbord, als silhouet.
 *
 * Hetzelfde idee als bij de Enter-vormen: niet uitleggen wat een trackpoint is,
 * maar laten zien waar je moet kijken. Drie toetsen met G, H en B erop, en het
 * ronde knopje ertussen — precies het plekje dat de medewerker moet nakijken.
 */
export function TrackpointGlyph({ present }: { present: boolean }) {
  return (
    <svg
      className="trackpoint-glyph"
      viewBox="0 0 72 44"
      width="72"
      height="44"
      aria-hidden="true"
      focusable="false"
    >
      {/* De rij met G en H, en daaronder de B: daartussen zit het knopje. */}
      <rect x="1.5" y="2.5" width="30" height="18" rx="3" className="trackpoint-key" />
      <rect x="40.5" y="2.5" width="30" height="18" rx="3" className="trackpoint-key" />
      <rect x="21" y="23.5" width="30" height="18" rx="3" className="trackpoint-key" />

      <text x="16.5" y="15" className="trackpoint-letter">G</text>
      <text x="55.5" y="15" className="trackpoint-letter">H</text>
      <text x="36" y="36" className="trackpoint-letter">B</text>

      {present ? (
        <circle cx="36" cy="12" r="6" className="trackpoint-dot" />
      ) : (
        /* Zonder knopje: dezelfde plek, leeg, zodat de twee knoppen naast
           elkaar hetzelfde beeld tonen met één verschil. */
        <circle cx="36" cy="12" r="6" className="trackpoint-dot-empty" />
      )}
    </svg>
  );
}
