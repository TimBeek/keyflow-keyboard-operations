# Werknemersworkflow

De werknemersflow is ontworpen voor handscanner, toetsenbord en tablet en beperkt vrije tekst waar dat fouten kan veroorzaken.

1. Scan de orderbarcode. De scanner sluit de invoer af met Enter of Tab.
2. Typ alleen het herkenbare modeldeel, bijvoorbeeld `5420`.
3. Bij één treffer kiest KeyFlow automatisch `Dell Latitude 5420`.
4. Bij meerdere treffers kiest de medewerker uit een korte lijst; bij nul treffers wordt de order geblokkeerd.
5. Kies een verkoopwaardeklasse: `< €100`, `€100–199`, `€200–299`, `€300–399`, `€400–499` of `€500+`.
6. Controleer aanwezige en gewenste layout.
7. KeyFlow toont direct methode, exact Noviply-SKU, E1/E2, locatie en voorraad.
8. Volg de aftekenlijst. Bij afronden wordt een oud Noviply-vel automatisch afgeboekt.
9. Registreer een niet-passende sticker apart; een volgende geslaagde sticker wordt daarna eveneens geboekt.

De huidige orderbarcode wordt als orderreferentie gebruikt. Zodra een ordersysteem wordt gekoppeld, kan dezelfde scan ook model, verkoopwaardeklasse en gewenste layout automatisch voorinvullen.
