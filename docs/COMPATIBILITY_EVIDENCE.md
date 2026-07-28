# Fysieke compatibiliteitsbewijzen

De bronkoppelingen uit Excel en de AI-modelgroepvoorstellen zijn geen fysiek bewijs. KeyFlow bewaart daarom iedere droge pastest per exacte combinatie van:

- hangmap en Noviply-SKU;
- laptopmodel;
- E1/E2-variant;
- keyboardlayout;
- fabrikantonderdeelnummer;
- keyboardbreedte en -hoogte;
- bovenaanzichtfoto of documentreferentie.

## Verplichte controle

Een managementgoedkeuring wordt geblokkeerd totdat Enter, beide Shift-toetsen, pijltoetsen, functierij en pointing-stick/numpadconfiguratie zijn bevestigd. Een afwijzing vereist een inhoudelijke reden.

Alle besluiten blijven als historie bewaard. Alleen de laatste beoordeling voor exact hetzelfde model en catalogusartikel bepaalt de actuele werknemersstatus:

- `approved`: de werknemer ziet het onderdeelnummer, de afmetingen en de fotoreferentie als aanvullend bewijs;
- `rejected`: de oude Noviply-methode wordt voor die model/SKU-combinatie uit het advies verwijderd.

Een afwijzing boekt geen voorraad. Een medewerker kan daardoor veilig stoppen voordat een vel wordt aangebracht.

## Opslag en centrale API

In pilotmodus worden bewijsrecords opgenomen in de gevalideerde lokale KeyFlow-back-up. Migratie `0012_compatibility_evidence.sql` voegt de versiegebonden PostgreSQL-audit toe.

`POST /api/compatibility/evidence`:

- valideert het bronmodel en alle bewijsvelden vóór databasegebruik;
- vereist de managementpermissie `models.manage`;
- gebruikt een idempotentiesleutel;
- koppelt het bewijs aan de centrale laptop- en SKU-records;
- geeft expliciet aan wanneer database, model of SKU nog niet beschikbaar is.
