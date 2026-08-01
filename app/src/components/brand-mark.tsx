/**
 * Het beeldmerk: een toets met de R van ReKey.
 *
 * Eerst een letter K in een vierkant — dat had net zo goed van een
 * boekhoudpakket kunnen zijn. Daarna een vel dat op een toets landt: twee lichte
 * vlakken over elkaar, mooi groot en onherkenbaar klein. Toen een toetsdop met
 * randje en daarin een blauwe R op wit; ook die viel in een tabblad uiteen,
 * want daar is de letter nog maar zeven pixels.
 *
 * Vijf varianten naast elkaar gezet op ware grootte, en dan wint er maar één:
 * een grote witte R op een vol blauw vlak. Het afgeronde vierkant is zelf al de
 * toetsdop; die vorm hoef je niet nog eens te tekenen. De kleuren komen uit de
 * stylesheet, dus het merk beweegt mee met licht en donker.
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
      <rect width="40" height="40" rx="10" className="brand-mark-bg" />
      <text
        x="20"
        y="30.5"
        textAnchor="middle"
        className="brand-mark-letter"
      >
        R
      </text>
    </svg>
  );
}
