# Werknemersworkflow

De werknemersflow is ontworpen voor handscanner, toetsenbord en tablet en beperkt vrije tekst waar dat fouten kan veroorzaken.

1. Scan de orderbarcode. De scanner sluit de invoer af met Enter of Tab.
2. Bij een bekende order vult KeyFlow automatisch het laptopmodel, de verkoopwaardeklasse en de aanwezige en gewenste layout in.
3. Een order met blokkadestatus kan niet worden uitgevoerd. Een onbekende order mag in de pilot handmatig verder, met een duidelijke waarschuwing.
4. Als het model nog niet is ingevuld, typ je alleen het herkenbare modeldeel, bijvoorbeeld `5420`.
5. Bij één treffer kiest KeyFlow automatisch `Dell Latitude 5420`.
6. Bij meerdere treffers kiest de medewerker uit een korte lijst; bij nul treffers wordt de uitvoering geblokkeerd.
7. Kies zo nodig een verkoopwaardeklasse: `< €100`, `€100–199`, `€200–299`, `€300–399`, `€400–499` of `€500+`.
8. Controleer aanwezige en gewenste layout.
9. KeyFlow toont direct methode, het exacte nummer van de hangmap, Noviply-SKU, E1/E2, layout en voorraad.
10. Pak uitsluitend de getoonde genummerde hangmap uit de hangmappenwagen.
11. Bevestig vóór het aanbrengen apart: hangmapnummer, SKU, layout, E1/E2 en droge positionering/toetsvorm.
12. Bij een afwijking kies je bewust tussen `melden zonder afboeken` voor een nog bruikbaar vel en `uitval −1` voor een gebruikt of beschadigd vel.
13. Pas na een volledig goedgekeurde pakcontrole wordt de uitvoeringslijst beschikbaar.
14. Bij succesvol afronden wordt precies één oud Noviply-vel automatisch afgeboekt.

De orderlookup gebruikt nu een vervangbare pilotadapter met representatieve orders. De gebruikersflow blijft gelijk wanneer deze adapter later op het echte ordersysteem wordt aangesloten.
