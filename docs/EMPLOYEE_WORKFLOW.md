# Werknemersworkflow

De werknemersflow is ontworpen voor handscanner, toetsenbord en tablet en beperkt vrije tekst waar dat fouten kan veroorzaken.

1. Scan de orderbarcode. De scanner sluit de invoer af met Enter of Tab.
2. Bij een bekende order vult KeyFlow automatisch het laptopmodel, de verkoopwaardeklasse en de aanwezige en gewenste layout in.
3. Een order met blokkadestatus kan niet worden uitgevoerd. Een onbekende order mag in de pilot handmatig verder, met een duidelijke waarschuwing.
4. Als het model nog niet is ingevuld, typ je alleen het herkenbare modeldeel, bijvoorbeeld `5420`.
5. Bij één treffer kiest KeyFlow automatisch `Dell Latitude 5420`.
6. Bij meerdere treffers kiest de medewerker uit een korte lijst; bij nul treffers wordt de uitvoering geblokkeerd.
7. Kies zo nodig een verkoopwaardeklasse: `< €100`, `€100–199`, `€200–299`, `€300–399`, `€400–499` of `€500+`.
8. Controleer aanwezige en gewenste layout. Bij handmatige invoer staat de gebruikelijke inkoopfamilie `Nordic` bovenaan.
9. `Nordic` is nog geen definitieve layout: open de herkenningsgids en kies Zweeds/Fins, Noors of Deens voordat je verdergaat.
10. KeyFlow toont direct methode, het exacte nummer van de hangmap, Noviply-SKU, E1/E2, layout en voorraad.
11. Pak uitsluitend de getoonde genummerde hangmap uit de hangmappenwagen.
12. Open bij twijfel de E1/E2- en pasvormgids vanuit de verplichte controle.
13. Bevestig vóór het aanbrengen apart: hangmapnummer, SKU, layout, E1/E2 en droge positionering/toetsvorm.
14. Bij een afwijking kies je bewust tussen `melden zonder afboeken` voor een nog bruikbaar vel en `uitval −1` voor een gebruikt of beschadigd vel.
15. Pas na een volledig goedgekeurde pakcontrole wordt de uitvoeringslijst beschikbaar.
16. Bij succesvol afronden wordt precies één oud Noviply-vel automatisch afgeboekt.

De orderlookup gebruikt nu een vervangbare pilotadapter met representatieve orders. De gebruikersflow blijft gelijk wanneer deze adapter later op het echte ordersysteem wordt aangesloten.

Zie `KEYBOARD_LAYOUT_REFERENCE.md` voor de herkenningsregels, bronlinks en de grens tussen een trainingsillustratie en goedgekeurd compatibiliteitsbewijs.
