/**
 * Het beeldmerk: een toets met de R van ReKey erop.
 *
 * Eerst stond hier een letter K in een blauw vierkant — dat had net zo goed van
 * een boekhoudpakket kunnen zijn. Daarna een vel dat op een toets landt: twee
 * lichte vlakken over elkaar. Dat werkte groot, maar in een browsertabblad zijn
 * dat zestien pixels, en dan blijven er twee vage vlekken over waar niemand
 * iets in herkent. Op dat formaat leest maar één ding: een letter.
 *
 * Nu een toetsdop met zijn rand, en daarop de R. Twee dingen tegelijk, allebei
 * meteen duidelijk: dit gaat over toetsenborden, en het heet ReKey. De kleuren
 * komen uit de stylesheet, dus het merk beweegt mee met licht en donker.
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="ReKey"
      focusable="false"
    >
      <rect width="40" height="40" rx="11" className="brand-mark-bg" />
      {/* De rand van de toetsdop, zoals je hem van bovenaf ziet. */}
      <rect x="7" y="7" width="26" height="26" rx="7" className="brand-mark-key" />
      {/* Het vlak waar de letter op staat. */}
      <rect x="10" y="10" width="20" height="20" rx="5" className="brand-mark-keyface" />
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        className="brand-mark-letter"
      >
        R
      </text>
    </svg>
  );
}
