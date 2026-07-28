# Werkvloerproeven en acceptatiebewijs

KeyFlow bevat onder `Beheer & analyse` → `Werkvloerproef` een aparte registratie voor echte proeven met werknemers, apparatuur en de fysieke hangmappenwagen. Deze registratie ondersteunt de uitvoering en audit, maar voert de proef niet zelf uit.

Gebruik vooraf `Beheer & analyse` → `Scenariotest` om 29 reproduceerbare softwarepaden te controleren. De gemarkeerde fysieke scenario’s worden daarna in deze echte werkvloerproef bevestigd. Zie `OPERATIONAL_SCENARIOS.md`.

## Doel

Een proef toont aan dat de werknemersflow onder werkelijke omstandigheden bruikbaar en veilig is. De registratie legt minimaal vast:

- proefreferentie, locatie, apparaat en scanner;
- aantal deelnemers, geteste orders en gemiddelde doorlooptijd;
- start- en eindmoment;
- gebruik van alle vier conversiemethoden;
- uitvoering van minimaal één foutscenario;
- zes afzonderlijke werkvloercontroles;
- resultaat, bewijsreferentie, notities en persoonlijke actor.

In pilotmodus blijft dit dossier onderdeel van de lokale KeyFlow-back-up. Met Entra en PostgreSQL actief worden de proeven persoonlijk en centraal opgeslagen.

## Resultaten

Een proef kan drie resultaten hebben:

- `open`: gepland of nog niet afgerond; dit levert geen acceptatiebewijs;
- `passed`: werkelijk uitgevoerd en aan alle harde voorwaarden voldaan;
- `failed`: afgerond met een vastgelegde oorzaak en vervolgactie.

Een mislukte proef vereist een eindmoment en minimaal tien tekens aan oorzaak/vervolgactie. Hierdoor kan een afwijzing niet zonder inhoud worden opgeslagen.

## Harde voorwaarden voor `passed`

KeyFlow accepteert een geslaagde proef alleen wanneer:

1. het eindmoment na de start ligt;
2. minimaal vijf orders zijn getest;
3. een gemiddelde doorlooptijd is ingevuld;
4. alle vier conversiemethoden werkelijk zijn uitgevoerd;
5. minimaal één foutscenario werkelijk is uitgevoerd;
6. alle zes werkvloercontroles afzonderlijk zijn bevestigd;
7. een herleidbare bewijsreferentie is ingevuld.

De zes controles zijn:

1. een order zonder muis scannen en laden;
2. het korte modelnummer naar het juiste laptopmodel oplossen;
3. het getoonde hangmapnummer met de fysieke wagen vergelijken;
4. Nordic-, layout- en E1/E2-informatie op het gebruikte scherm lezen;
5. voorraad pas na de verplichte controle afboeken;
6. een verkeerd of niet-passend vel zonder stille afboeking stoppen.

Er is bewust geen knop om alle controles tegelijk af te vinken.

## Uitvoeringsprotocol

1. Registreer eerst een `open` proef met de echte locatie, scanner, tablet of werkstation en deelnemers.
2. Gebruik representatieve orders voor ieder van de vier methoden.
3. Voer minimaal één gecontroleerd foutscenario uit, bijvoorbeeld een verkeerd vel of een niet-passende variant.
4. Meet de doorlooptijd en controleer de fysieke hangmap en voorraadmutatie.
5. Registreer na afloop `passed` of `failed` met de werkelijke bevindingen.
6. Bewaar foto’s, meetstaat, ticket of ondertekend rapport buiten KeyFlow en vul de herleidbare referentie in.

Een proefrecord is een momentopname. Een herhaling wordt als een nieuwe proef met een nieuwe referentie geregistreerd, zodat de historie intact blijft.

## Scheiding van bevoegdheden

Een geslaagde proef levert bewijs, maar keurt de formele go-livepoort niet automatisch goed. Management neemt de bewijsreferentie afzonderlijk over onder `Beheer & analyse` → `Vrijgave` → `Werkvloeracceptatie`. Daar bevestigt de verantwoordelijke eigenaar het besluit en de vier poortspecifieke bewijscontroles.

Alleen de actuele vijf afzonderlijk goedgekeurde go-livepoorten kunnen de centrale `5/5`-vrijgave bereiken.

## Centrale opslag en autorisatie

Migratie `0016_workfloor_acceptance_trials.sql` voegt de centrale, idempotente registratie en databasecontroles toe.

- `GET /api/operations/workfloor-trials` vereist `reports.view`.
- `POST /api/operations/workfloor-trials` vereist `policies.manage`.
- De `GET`-response bevat de historie en een serverberekende samenvatting.
- In productiemodus komt de actor uit de persoonlijke Entra-sessie.
- Iedere nieuwe registratie schrijft `operations.workfloor_trial_recorded` naar de auditlog.
- De database herhaalt de belangrijkste `passed`- en `failed`-voorwaarden als constraints.

CI registreert uitsluitend een open proef tegen tijdelijke PostgreSQL. Geautomatiseerde tests maken dus nooit vals werkvloeracceptatiebewijs.

## Nog nodig voor 100%

Werknemers en management moeten de proef met de echte scanners, apparaten, hangmappenwagen en representatieve orders uitvoeren. Het resulterende bewijs moet daarna door de verantwoordelijke eigenaar in de aparte go-livepoort worden beoordeeld.
