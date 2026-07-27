# Pilotopslag en orderlookup

Dit bouwblok maakt de werknemersflow sneller en voorkomt dat pilotboekingen bij het verversen van de pagina verdwijnen. Het is bewust voorbereid op een latere centrale order- en databasekoppeling.

## Orderlookup

De scannerinvoer accepteert een volledige orderreferentie, een korte alias en een barcode-URL waarvan de ordercode het laatste onderdeel is.

- Een bekende, uitvoerbare order vult ordernummer, laptopmodel, verkoopwaardeklasse, huidige layout en gewenste layout automatisch in.
- Een bekende order met blokkadestatus stopt de uitvoering en toont de reden.
- Een onbekende order blijft in de pilot handmatig uitvoerbaar met een zichtbare waarschuwing.
- De lookup-logica staat los van de gebruikersinterface. De huidige demo-adapter kan daardoor worden vervangen door een ERP- of ordersysteemconnector zonder de werknemersflow opnieuw te ontwerpen.

## Lokale pilotpersistentie

Voorraadaantallen, transacties en het managementbeleid worden automatisch in de browser opgeslagen. De gegevens:

- worden door een versienummer en schema gevalideerd;
- worden na verversen of opnieuw openen van de app hersteld;
- kunnen niet met negatieve aantallen of een ongeldige beleidsconfiguratie worden geladen;
- blijven beperkt tot de browser en het apparaat waarop de pilot draait.

Management ziet de opslagstatus en het moment van de laatste opslag. Ook kan management:

- een JSON-back-up downloaden;
- een JSON-back-up gecontroleerd herstellen;
- de pilotgegevens na een aparte bevestiging terugzetten naar de demonstratiebasis.

## Productiegrens

Lokale browseropslag is niet geschikt als gedeelde administratie voor meerdere medewerkers. Er is nog geen realtime synchronisatie tussen apparaten, centrale back-up, persoonlijke auditidentiteit of conflictbehandeling.

Voor productie worden dezelfde domeinacties aangesloten op de aanwezige PostgreSQL-transactielaag. Daarna volgen persoonlijke authenticatie, server-side autorisatie, centrale back-up/herstel, monitoring en de koppeling met het werkelijke ordersysteem.
