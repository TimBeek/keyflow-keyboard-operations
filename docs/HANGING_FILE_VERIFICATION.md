# Hangmappenwagen en Noviply-controle

## Betekenis van Excel-kolom `nr.`

Het nummer in de eerste kolom van `Toetsenbordstickers voorraad.xlsx` is de fysieke locatie van het oude Noviply-vel in de genummerde hangmappenwagen.

- De 148 bronregels gebruiken exact de nummers 1 tot en met 148.
- Het nummer is geen SKU, modelgroep of compatibiliteitsbewijs.
- De import noemt het veld `storageNumber` en signaleert een ontbrekend, ongeldig of dubbel nummer.
- In PostgreSQL wordt de productielocatie opgeslagen als `sticker_skus.hanging_file_number`.

Voorbeeld: `Dell Latitude 5420`, `QWERTY US`, SKU `NB10172E1NL`, variant `E1` ligt volgens de bron in hangmap 75. De Franse variant `NB10172E1FR` ligt in hangmap 8.

## Verplichte controle vóór afboeken

Bij de methode `Oude Noviply-voorraadvel` toont KeyFlow eerst de exacte hangmap en het etiket dat de medewerker moet aantreffen. De medewerker bevestigt vervolgens vijf punten:

1. de juiste genummerde hangmap is gepakt;
2. het artikelnummer op het vel is exact gelijk;
3. de taal/layout is gelijk aan de klantlayout;
4. de E1/E2-variant is gecontroleerd;
5. toetsvormen, uitsparingen en positionering lijnen droog correct uit.

De aanbrenginstructies blijven verborgen totdat alle vijf punten zijn bevestigd. De normale voorraadmutatie van −1 vindt pas plaats nadat ook de volledige uitvoering is afgetekend.

## Afwijkingen

Als iets niet klopt, kiest de medewerker de reden en één van twee uitkomsten:

- `Gestopt · niet afgeboekt`: het vel is nog bruikbaar. KeyFlow registreert de afwijking maar verandert de voorraad niet.
- `Uitval · afgeboekt`: het vel is al gebruikt of beschadigd. KeyFlow registreert de afwijking en boekt precies één vel af.

Management ziet beide soorten meldingen in `Beheer & analyse` onder `Hangmapcontroles`. Daardoor zijn verkeerde locaties, SKU's, layouts, E1/E2-varianten en positioneringsproblemen afzonderlijk analyseerbaar.

Bronnotities uit Excel worden als waarschuwing getoond. Zo wordt een bekende opmerking over maatvoering of een foutief taaletiket zichtbaar vóórdat een medewerker het vel aanbrengt.
