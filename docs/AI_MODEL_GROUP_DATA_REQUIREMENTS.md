# Datavereisten voor AI-modelgroepen

KeyFlow maakt nu een eerste, herleidbare wachtrij van laptopmodellen die mogelijk een keyboard delen. De score gebruikt uitsluitend de gecontroleerde catalogusbron; een toekomstige externe AI-provider kan aanvullende bronnen voorstellen. Een voorstel mag nooit automatisch betekenen dat een sticker compatibel is. De combinatie moet fysiek worden gevalideerd en door management worden goedgekeurd.

## Minimaal benodigde gegevens

Per laptopmodel en keyboardvariant zijn ten minste nodig:

- fabrikant, serie, exact model en eventuele modelaliases;
- fabrikantonderdeelnummer van keyboard, palmrest en topcase;
- fysieke keyboardafmetingen, toetsvormen en afwijkende toetsposities;
- aanwezige en gewenste keyboardlayout;
- exacte Noviply-SKU en afzonderlijke E1/E2-variant;
- bron van de compatibiliteitsclaim;
- status `onbekend`, `AI-voorstel`, `fysiek getest`, `voorwaardelijk` of `afgekeurd`;
- datum, medewerker en bewijs van de fysieke pastest;
- foto's van keyboard en toegepast stickervel;
- mislukte pasvorm, kwaliteitsuitval en toelichting.

## Veilige AI-werkwijze

1. Normaliseer modelnamen en verzamel betrouwbare fabrikant- en leveranciersbronnen.
2. Laat de assistent alleen kandidaten groeperen en een waarschijnlijkheid met bronverwijzingen geven.
3. Splits iedere E1/E2- of keyboardonderdeelvariant expliciet.
4. Laat een medewerker de pasvorm testen.
5. Laat management de koppeling goedkeuren.
6. Gebruik alleen goedgekeurde koppelingen voor automatisch SKU-advies.

## Eerstvolgende gegevensverzameling

De huidige Excel-voorraad bevat modelnaam, gekoppelde modellen, SKU, layout, hangmapnummer en een E1/E2-aanduiding in het SKU-nummer. De managementwachtrij markeert modellen die in meerdere SKU/layout-combinaties voorkomen. Voor betrouwbare fysieke goedkeuring ontbreken vooral fabrikantonderdeelnummers, afmetingen, foto's en gestructureerde resultaten van geslaagde en mislukte pastesten.

De Excel-kolom `nr.` is uitsluitend de fysieke hangmaplocatie. Een gelijk of nabij hangmapnummer is geen bewijs dat modellen, layouts of E1/E2-varianten compatibel zijn.
