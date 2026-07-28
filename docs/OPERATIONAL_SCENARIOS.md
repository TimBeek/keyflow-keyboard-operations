# Operationele scenariotest

KeyFlow bevat onder `Beheer & analyse` → `Scenariotest` een reproduceerbare softwareproef. Management kan hiermee normale routes, grensgevallen en foutpaden opnieuw uitvoeren en als JSON-rapport exporteren.

## Dekking

De huidige matrix bevat 29 scenario’s in zes categorieën:

| Categorie | Voorbeelden |
|---|---|
| Conversiebeleid | Gelijke layout, €299/€300-grens, buitenlandse layout, printeruitval, losse-stickerfallback en volledige blokkade |
| Order & model | `5420` automatisch herkennen, ambigue `G7` als dropdown en overlappende waardeklasse blokkeren |
| Hangmap & voorraad | Excelmomentopname, geblokkeerde bronregels, hangmap 75, nulvoorraad, onbekend model, in-/uitboeken en negatieve voorraad |
| Veiligheidsblokkades | Onvolledige vijfpuntscontrole, E1/E2-afwijking en onvolledig compatibiliteitsbewijs |
| Rollen & rechten | Beperkte werknemerstoegang en volledige managementpermissies |
| Acceptatie & vrijgave | `0/5`-blokkade en weigering van onvolledig werkvloerbewijs |

Ieder scenario legt vast:

- een stabiel scenario-ID;
- categorie en risicotype;
- verwacht resultaat;
- werkelijk berekend resultaat;
- status `Geslaagd` of `Mislukt`;
- of aanvullende fysieke bevestiging nodig is.

## Risicotypen

- `Normaal pad`: de gebruikelijke operationele route moet slagen.
- `Grensscenario`: grensbedrag, ambiguïteit of fallback moet exact voorspelbaar zijn.
- `Negatief pad`: een onveilige of ongeldige actie moet aantoonbaar stoppen.

Een mislukte negatieve test is extra belangrijk: die betekent dat een blokkade niet meer werkt.

## Uitvoeren en exporteren

1. Open `Beheer & analyse` → `Scenariotest`.
2. Kies `Opnieuw uitvoeren`.
3. Controleer dat alle categorieën volledig groen zijn en dat er geen blokkerende afwijking staat.
4. Filter indien nodig op categorie of resultaat.
5. Kies `JSON-rapport` voor een versieerbaar bewijsbestand met actor, uitvoeringstijd, samenvatting en alle 29 uitkomsten.

Dezelfde matrix draait tijdens `npm run test`. GitHub CI blokkeert een merge zodra een verwacht scenario afwijkt.

## Bewijsgrens

Een score van 29/29 bewijst dat de geïmplementeerde softwarelogica zich in deze scenario’s correct gedraagt. Het bewijst niet zelfstandig:

- dat een sticker fysiek op een specifiek toetsenbord past;
- dat de echte scanner op het bedrijfsdomein correct werkt;
- dat de fysieke hangmappenwagen met de digitale locatie overeenkomt;
- dat Entra, PostgreSQL of het order-/ERP-systeem in productie beschikbaar is;
- dat werknemers en management de werkwijze formeel accepteren.

Scenario’s die zo’n controle nodig hebben tonen daarom `Fysiek bevestigen`. De scenariotest verlaagt het technische risico, terwijl `Werkvloerproef` en `Vrijgave` het echte externe bewijs gescheiden bewaren.
