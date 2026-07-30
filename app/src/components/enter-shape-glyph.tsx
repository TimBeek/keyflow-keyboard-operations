/**
 * Het Enter-gedeelte van het toetsenbord, als silhouet.
 *
 * De volledige voorbeeldfoto's staan achter het i-knopje, maar die zijn bijna
 * twee megabyte per stuk en op een knop is de Enter-toets erop niet groter dan
 * een paar pixels. Waar het werkelijk om gaat is de vórm, en die is precies te
 * tekenen: E1 is één rij hoog en breed, E2 loopt over twee rijen als een
 * omgekeerde L. De toets zelf is gevuld, de buren staan er als omtrek bij zodat
 * je ziet waar hij zit.
 */
export function EnterShapeGlyph({ shape }: { shape: "E1" | "E2" }) {
  return (
    <svg
      className="enter-glyph"
      viewBox="0 0 72 44"
      width="72"
      height="44"
      aria-hidden="true"
      focusable="false"
    >
      {/* De toetsen links ervan, alleen als omtrek: die zijn niet de vraag. */}
      <rect x="1.5" y="2.5" width="18" height="18" rx="3" className="enter-glyph-neighbour" />
      <rect x="1.5" y="23.5" width="18" height="18" rx="3" className="enter-glyph-neighbour" />

      {shape === "E2" ? (
        <>
          {/* Eén rij hoog en breed; onder hem ligt de rechter shift. */}
          <rect x="23.5" y="2.5" width="47" height="18" rx="3" className="enter-glyph-key" />
          <rect x="23.5" y="23.5" width="47" height="18" rx="3" className="enter-glyph-neighbour" />
        </>
      ) : (
        <>
          {/* Twee rijen hoog: breed boven, smaller onder — de omgekeerde L. */}
          <path
            d="M26.5 2.5H70.5V41.5H46.5V23.5H26.5Z"
            className="enter-glyph-key"
          />
          {/* De toets links van het onderste deel; daar zit de stap. */}
          <rect x="23.5" y="23.5" width="20" height="18" rx="3" className="enter-glyph-neighbour" />
        </>
      )}

      <path d="M62 8v5H48m0 0 3-3m-3 3 3 3" className="enter-glyph-arrow" />
    </svg>
  );
}
