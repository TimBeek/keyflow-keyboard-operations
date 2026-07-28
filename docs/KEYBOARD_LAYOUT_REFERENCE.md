# Keyboardlayout- en E1/E2-referentie

## Doel

De werknemersgids helpt bij twee verschillende beslissingen:

1. de aanwezige en gewenste taal-layout correct registreren;
2. vóór gebruik van een oud Noviply-vel controleren of de fysieke stickeruitsparingen passen.

Deze beslissingen mogen niet door elkaar worden gehaald. `E1` en `E2` zijn leveranciersvarianten in het artikelnummer; het zijn geen talen en er is geen publiek onderbouwde universele vormregel waarmee KeyFlow zelfstandig van E1 naar E2 kan vertalen.

## Scandinavische startkeuze

Ingekochte laptops hebben vaak een Scandinavische layout. Daarom staat `QWERTY Nordic (nog specificeren)` als eerste keuze bij de huidige layout.

Deze waarde is alleen een startkeuze. De werknemer moet vóór het advies één van de exacte waarden selecteren:

- `QWERTY SE/FI` — Zweeds/Fins, herkenbare letterset `Å Ä Ö`;
- `QWERTY NO` — Noors, letterset `Å Æ Ø`;
- `QWERTY DK` — Deens, letterset `Å Æ Ø`.

Noors en Deens kunnen niet betrouwbaar met alleen de drie taalletters van elkaar worden onderscheiden. Vergelijk de overige symbooltoetsen met een goedgekeurde model- of leveranciersfoto.

De officiële Apple-herkenningspagina laat eveneens afzonderlijke Deense, Noorse en Zweeds/Finse layouts zien. Dit is een visuele taalreferentie, geen garantie dat iedere laptopfabrikant identieke toetsvormen of posities gebruikt:

- <https://support.apple.com/en-nz/102743>

Noviply beschrijft de stickers als model- en taalspecifiek en biedt meerdere Europese talen. De openbare productinformatie geeft geen universele definitie van E1/E2:

- <https://noviply.com/laptop-keyboard-sticker/>
- <https://noviply.com/shop/>

## Nederlands tegenover US International

Een fysiek Nederlands QWERTY-keyboard kan sterk lijken op US International. De door iUsed gepubliceerde MacBook-vergelijking gebruikt de volgende visuele aanknopingspunten:

- US International: horizontale Enter/Return, bredere Shift en backslash rechtsboven de Enter;
- Nederlands: verticale Return, backslash linksonder de Return, euroteken boven de `2` en een kleinere Shift met tilde/grave ernaast.

Deze punten zijn in KeyFlow als aparte vergelijking opgenomen:

- <https://www.iused.be/en/blog/the-difference-between-dutch-and-us-int-qwerty>

De bron toont Apple-keyboards. Gebruik de vergelijking daarom alleen als herkenningshulp; voor een Dell- of ander laptopmodel blijven de fysieke toetsen, het onderdeelnummer en een goedgekeurde modelfoto leidend.

## Verplichte E1/E2- en pasvormcontrole

Controleer vóór het lostrekken of aanbrengen:

1. het exacte SKU-label en de daarin opgenomen E1/E2-code;
2. de Enter-vorm;
3. de breedte van linker- en rechter-Shift;
4. het pijltjescluster;
5. maat en tussenruimte van de functierij;
6. aanwezigheid en rand van een numeriek toetsenblok;
7. een eventuele pointing-stickuitsparing;
8. de droge uitlijning van alle toetsen en randen terwijl drager en kleeflaag intact blijven.

Bij twijfel meldt de werknemer `wrong_variant` of `position_mismatch` en stopt zonder afboeken zolang het vel nog bruikbaar is. Alleen een al gebruikt of beschadigd vel wordt als uitval geboekt.

## Referentiebeheer

Migratie `0009_keyboard_reference_library.sql` voegt een beheerbare referentiebibliotheek toe:

- layouts kunnen als exact of nog te specificeren worden gemarkeerd;
- modelfoto's, leveranciersbronnen en E1/E2-varianten kunnen per layout en laptopmodel worden vastgelegd;
- een referentie krijgt `draft`, `approved` of `rejected`;
- alleen een door management goedgekeurd record mag later als compatibiliteitsbewijs dienen.

De actieve illustratie in `app/public/keyboard-reference-guide-dell.png` is een eigen gegenereerde Dell Latitude-stijl trainingsillustratie. Zij markeert controlepunten, maar bewijst niet dat een specifieke sticker E1 of E2 is. De eerdere generieke versie blijft als bronvariant beschikbaar in `app/public/keyboard-reference-guide.png`.
