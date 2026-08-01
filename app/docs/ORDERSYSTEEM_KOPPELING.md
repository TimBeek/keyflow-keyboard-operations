# De printronde rechtstreeks aanleveren

Tot nu toe kwam de lijst van Noviply als bestand binnen: iemand exporteerde hem
uit het ordersysteem en uploadde hem in ReKey. Dat werkt, maar er zit een mens
tussen die het kan vergeten, en tussen 12:30 en het moment dat iemand eraan denkt
staat de werkvloer stil.

Het ordersysteem kan de lijst nu zelf posten. Wat er dan gebeurt is precies
hetzelfde als bij een upload: er ontstaat een printronde, Noviply krijgt zijn
melding, en de regels komen onder **Print runs** te staan.

## Waar

```
POST https://<rekey>/api/resync-export-noviply
GET  https://<rekey>/api/resync-export-noviply
```

## Aanmelden

Eén gedeelde sleutel, in de kop:

```
Authorization: Bearer <sleutel>
```

`X-ReKey-Token: <sleutel>` mag ook, voor systemen die de Authorization-kop zelf
al gebruiken.

De sleutel staat op de server in de omgevingsvariabele **`REKEY_RESYNC_TOKEN`**
en moet minstens 16 tekens zijn. Staat hij er niet, dan geeft de route `503` en
doet hij niets — een koppeling die zonder sleutel iedereen binnenlaat is precies
de fout die je pas merkt als het te laat is.

Een sleutel maken:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Deze sleutel opent alleen deze ene route. Wie hem heeft kan een printronde
aanleveren en terugkijken, en verder niets.

## Aanleveren

De inhoud is de lijst zelf. De veldnamen zijn precies de kolomkoppen uit het
exportbestand, zodat wie de export al kan maken niets hoeft te hernoemen.

```json
[
  { "model": "HP ProBook 430 G7",  "language": "BE", "layout": "E1", "quantity": 1, "ordernummer": "6000016965" },
  { "model": "HP ProBook 430 G7",  "language": "BE", "layout": "E1", "quantity": 1, "ordernummer": "6000016965" },
  { "model": "Dell Latitude 7330", "language": "BE", "layout": "E1", "quantity": 1, "ordernummer": "6000016967" },
  { "model": "Dell Latitude 5320", "language": "ES", "layout": "E1", "quantity": 1, "ordernummer": "5000003967" },
  { "model": "HP ProBook 440 G5",  "language": "FR", "layout": "E1", "quantity": 1, "ordernummer": "4000009863" }
]
```

| Veld | Wat erin hoort |
|---|---|
| `model` | Het model zoals het ordersysteem het schrijft. Verplicht. |
| `language` | De tweeletterige landcode: NL, BE, DE, ES, IT, FR, PT, US, UK, SE, FI, NO, DK, PL. |
| `layout` | `E1` of `E2` — de vorm van de Enter-toets. |
| `quantity` | Aantal vellen. Ontbreekt of onleesbaar wordt 1. |
| `ordernummer` | Als tekst; een getal mag ook en wordt omgezet. |

**Twee identieke regels blijven twee regels.** Twee laptops op dezelfde order
zijn twee vellen; ontdubbelen zou de tweede laptop een vel tekortdoen.

### Datum en rondenummer

Zonder verdere opgave wordt de ronde op vandaag geboekt (Nederlandse tijd) en
krijgt hij het eerstvolgende nummer van die dag: de ochtendlevering wordt ronde
1, de middaglevering ronde 2. Wil het ordersysteem het zelf bepalen — bijvoorbeeld
om een ronde van gisteren na te sturen — dan kan de lijst in een omhulsel:

```json
{
  "runDate": "2026-08-01",
  "batchNumber": 2,
  "source": "Navision",
  "rows": [ ... ]
}
```

`source` komt terug in de rondelijst als herkomst; zonder opgave staat er
"Ordersysteem".

### Wat je terugkrijgt

```json
{
  "batchId": "9ae7c14f-0555-4fce-993e-c2199df6e473",
  "runDate": "2026-08-01",
  "batchNumber": 1,
  "rows": 5,
  "duplicate": false,
  "sameContent": false,
  "unknownLanguageCodes": []
}
```

`201` bij een nieuwe ronde, `200` als hij er al stond.

### Twee keer sturen doet geen kwaad

Krijgt de koppeling geen antwoord — verbinding weg, time-out — dan mag hij het
gewoon opnieuw proberen. Dezelfde lijst wordt herkend aan zijn inhoud en levert
dezelfde ronde op, met `duplicate: true`. Er komt niets dubbel te staan en
Noviply print niets twee keer.

Een lijst met één gewijzigde regel is wél een andere lijst, en wordt de volgende
ronde van die dag.

### Onbekende landcodes

Een code die ReKey niet kent (`ZZ`) laat de regel gewoon staan, zonder taal
erbij. Hij komt in `unknownLanguageCodes` terug en Noviply ziet er een melding
bij. De hele ronde afkeuren op één onbekende code zou de andere regels
tegenhouden, en die kunnen prima door.

## Terugkijken

```
GET /api/resync-export-noviply
```

Geeft de rondes die nog openstaan, met per regel de status (`open`, `printed`,
`not_printable`). Met `?scope=all` komen ook de afgeronde rondes mee. Handig om
te zien of een levering is aangekomen en wat er nog niet geprint is.

## Foutmeldingen

| Code | Betekent |
|---|---|
| `401` | Geen of een verkeerde sleutel. |
| `400` | De regels kloppen niet; `issues` zegt per veld wat er mis is. |
| `429` | Te veel verzoeken achter elkaar. |
| `503` | De sleutel staat niet ingesteld op de server. |

## Onder welke naam het gebeurt

De koppeling handelt onder een eigen account, "Ordersysteem"
(`00000000-0000-0000-0000-000000000004`, aangemaakt in migratie 0043). In de
rondelijst staat dus wie de ronde heeft aangeleverd — een machine, en dat is
precies wat er gebeurd is. Zonder eigen account zou de ronde op naam van een
collega staan die er niet bij was, en juist in die geschiedenis zoeken we een
order terug.
