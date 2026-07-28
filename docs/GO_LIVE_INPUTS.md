# Benodigde invoer voor KeyFlow 100%

De resterende stappen zijn productie-aansluitingen en acceptatiebewijzen. De applicatiecode kan hiervoor worden voorbereid, maar deze gegevens of toegangen mogen niet worden verzonnen.

## 1. Centrale PostgreSQL-omgeving

Nodig:

- beheerde PostgreSQL-server en database;
- `DATABASE_URL`, SSL-beleid en netwerktoegang;
- bewaartermijn, back-upfrequentie en hersteltijddoel;
- goedkeuring voor het uitvoeren van migraties `0001` tot en met `0012`;
- goedgekeurde afhandeling van de drie harde Excel-fouten en negen mogelijke dubbele groepen;
- fysieke begintelling per hangmap vóór live-import.

Al aantoonbaar voorbereid:

- de Excelbron is als reproduceerbare seed met SHA-256-herkomst vastgelegd;
- alle 148 hangmapnummers zijn uniek en de bron telt 3.218 vellen;
- 139 regels zijn operationeel bruikbaar;
- 9 regels met ontbrekende of dubbele artikelnummers worden veilig tegen boeken geblokkeerd;
- gekoppelde modellen, bronnotities en conflicterende kandidaat-SKU's zijn zichtbaar voor management.
- fysieke tellingen zijn per hangmap ontworpen, inclusief verplichte verschilreden, idempotente correctie en auditregel voor een kloppende telling;

Acceptatiebewijs:

- migraties zonder fout uitgevoerd;
- alle 148 hangmapnummers uniek;
- openingsvoorraad sluit aan op de ondertekende telling;
- de geregistreerde begintellingen zijn per hangmap terug te vinden en ieder verschil verwijst naar exact één correctietransactie;
- twee gelijktijdige apparaten zien dezelfde boeking;
- hersteltest van een back-up is vastgelegd.

## 2. Persoonlijke login en rollen

Nodig:

- Microsoft Entra-tenant-ID en appregistratie;
- redirect-URL van staging en productie;
- gebruikers of groepen die aan de app-rollen `KeyFlow.Employee` en `KeyFlow.Management` worden toegewezen;
- contactpersoon die groepslidmaatschap mag goedkeuren;
- sessieduur en MFA-/Conditional Access-beleid.

Al aantoonbaar voorbereid:

- single-tenant OIDC-configuratie met tenantgebonden issuer;
- app-rolmapping zonder handmatige managementschakelaar;
- persoonlijke databasegebruikerssynchronisatie en blokkade van gedeactiveerde accounts;
- achtuurs sessies en server-side actorvervanging op beveiligde mutatie- en import-API's;
- veilige health- en readinesscontroles zonder weergave van secrets.

Acceptatiebewijs:

- iedere mutatie bevat de persoonlijke medewerker;
- een werknemer kan geen managementactie uitvoeren;
- uitloggen en sessieverloop blokkeren nieuwe mutaties;
- gedeactiveerde accounts verliezen direct toegang.

## 3. Order- of ERP-koppeling

Nodig:

- naam van het ordersysteem en eigenaar;
- test- en productie-API-URL;
- authenticatiemethode en testaccount;
- veldmapping voor ordernummer, laptop-ID, model, verkoopwaarde, huidige layout, gewenste layout en blokkadestatus;
- regels voor annulering, retour en dubbele scans.

Acceptatiebewijs:

- bekende barcode laadt exact de juiste order;
- onbekende, geblokkeerde en geannuleerde orders volgen de afgesproken route;
- orderbedrag en layout worden niet handmatig overschreven zonder auditreden;
- tijdelijke API-uitval veroorzaakt geen stille dubbele boeking.

## 4. Keyboard- en E1/E2-referenties

Nodig per goedgekeurde combinatie:

- fabrikant, model en eventuele generatie;
- fabrikantonderdeelnummer;
- exact Noviply-SKU en E1/E2-code;
- foto recht van boven met zichtbare Enter, beide Shift-toetsen, pijltjes, functierij en pointing stick;
- resultaat en datum van fysieke droge pastest;
- naam van de goedkeurende manager.

Acceptatiebewijs:

- alleen een status `approved` wordt als compatibiliteitsbewijs getoond;
- een mismatch kan zonder afboeken worden gemeld;
- beschadigde uitval wordt afzonderlijk afgeboekt;
- management kan de oorzaak per model, SKU en variant analyseren.

## 5. Werkvloeracceptatie

Nodig:

- minimaal één scanner, één tablet/werkstation en de echte hangmappenwagen;
- werknemers uit vroege en late dienst;
- representatieve set Dell-, HP- en overige modellen;
- orders voor iedere conversiemethode en minimaal één foutscenario.

Acceptatiebewijs:

- scan naar advies werkt zonder muis;
- hangmapnummer komt overeen met de fysieke wagen;
- Nordic, NL/US en E1/E2-gids zijn leesbaar op het gebruikte scherm;
- afboeken gebeurt pas na de verplichte controle;
- doorlooptijd en fouten worden voor en na invoering gemeten.

## Vrijgave

KeyFlow bereikt pas 100% nadat bovenstaande vijf onderdelen door de aangewezen eigenaar zijn afgetekend, de productieomgeving de volledige regressieset doorstaat en de vrijgaveversie via GitHub naar de gekozen private host is uitgerold.
