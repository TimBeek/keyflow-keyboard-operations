/**
 * Het beeldmerk: een vel dat op een toets komt.
 *
 * Er stond een letter K in een blauw vierkant. Dat zegt niets over het werk en
 * het had net zo goed van een boekhoudpakket kunnen zijn. Wat hier elke dag
 * gebeurt is: er ligt een toets, en daar komt een vel op.
 *
 * Twee vormen dus, allebei recht en op het raster — geen schuine hoeken, want
 * dit staat de hele dag naast iemands werk en hoort rustig te zijn. De onderste
 * vorm is de toetsdop met zijn rand, de bovenste is het vel dat er half
 * overheen ligt. Die overlap is het hele verhaal: twee lagen in plaats van één.
 *
 * De kleuren komen uit de stylesheet, dus het merk beweegt mee met licht en
 * donker. Geen dunne lijnen: op zestien pixels in een browsertabblad blijft
 * alleen de vorm over, en die moet het dan doen.
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="KeyFlow"
      focusable="false"
    >
      <rect width="40" height="40" rx="11" className="brand-mark-bg" />

      {/* De toets, links onder: dop met de rand die je van bovenaf ziet. */}
      <rect x="7" y="14" width="19" height="19" rx="4.5" className="brand-mark-key" />
      <rect x="10" y="17" width="13" height="13" rx="2.5" className="brand-mark-keyface" />

      {/* Het vel, rechts boven, half over de toets heen. */}
      <rect x="17" y="7" width="16" height="16" rx="3.5" className="brand-mark-sheet" />
    </svg>
  );
}
