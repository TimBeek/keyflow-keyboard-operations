# KeyFlow — Keyboard Conversion Management

KeyFlow vervangt de huidige Excel-voorraad en ondersteunt uiteindelijk de volledige keuze en uitvoering van vier keyboard-conversiemethoden.

## Huidige status

De eerste applicatiebasis bevat:

- een responsief operationeel dashboard;
- de geverifieerde Excel-momentopname van 3.218 stickervellen en 148 voorraadregels;
- aandacht voor lage en kritieke voorraad;
- de vier conversiemethoden en de configureerbare €300-beleidsgrens;
- een interactieve conversieadviseur met fallback- en blokkeerregels;
- veilige afboek- en ontvangstberekeningen die negatieve voorraad voorkomen;
- een PostgreSQL-datamodel voor gebruikers, modellen, compatibiliteit, voorraadtransacties, conversieorders, kwaliteit en audit;
- een eerste PostgreSQL-migratie met de vier methoden, drie layouts en twee voorraadlocaties;
- een server-side voorraad-API met rijvergrendeling, idempotentie en bescherming tegen negatieve voorraad;
- een health endpoint dat veilig meldt of de databaseomgeving is geconfigureerd;
- een Excel-analysecommando dat importfouten, waarschuwingen en mogelijke dubbelen rapporteert;
- een gecontroleerde Excel-upload naar importstaging, met bestandsduplicaatcontrole en herleidbare bevindingen per bronrij;
- een importbeoordeling met filters, verplichte afhandelnotitie en auditregistratie;
- gevalideerde correctieacties: waarde corrigeren, waarschuwing accepteren, dubbele regel apart behouden of een bronrij uitsluiten;
- functionele hoofdnavigatie voor voorraad, conversies, bestellingen, modellen en rapportages;
- een filterbare voorraadcatalogus met dekking, reserveringen, levertijd en planstatus;
- automatisch besteladvies op basis van verbruik, levertijd, veiligheidsvoorraad en open bestellingen;
- een interne conceptbestelling, modelgroepenoverzicht en 1/3/6-maandsrapportage;
- gescheiden management- en werknemersweergaven;
- rolgebaseerde serverpermissies voor voorraaduitvoering en importbeheer;
- een vereenvoudigde werknemersflow met methodeadvies, werkinstructies en aftekenlijst;
- een productiebuild zonder lint- of TypeScriptfouten;
- een containerdefinitie en GitHub Actions voor CI en image-publicatie.

De mutaties zijn in deze ontwikkelversie alleen actief binnen de geopende browsersessie. Duurzame opslag en gebruikersauthenticatie worden aangesloten zodra de PostgreSQL- en hostingomgeving beschikbaar zijn.

De server-side transactielaag is al aanwezig en wordt actief zodra `DATABASE_URL` is ingesteld en de migratie is uitgevoerd.

## Lokaal starten

Vereist Node.js 24.

```text
cd app
npm ci
npm run dev
```

Open vervolgens `http://localhost:3000`.

## Controles

```text
cd app
npm audit --audit-level=high
npm run test
npm run lint
npm run build
```

## PostgreSQL initialiseren

1. Kopieer `app/.env.example` naar `app/.env.local`.
2. Vul een geldige `DATABASE_URL` in.
3. Voer vanuit `app` uit:

```text
npm run db:migrate
```

De database-API's zijn daarna beschikbaar via:

- `POST /api/inventory/mutations` voor een idempotente voorraadmutatie;
- `POST /api/imports/inventory` voor een gecontroleerde `.xlsx`-upload;
- `GET /api/imports/inventory/{batchId}` voor alle herleidbare bevindingen van een import;
- `PATCH /api/imports/inventory/{batchId}/issues/{issueId}` voor auditbare afhandeling;
- `POST /api/planning/reorder-advice` voor maximaal 500 herbruikbare forecastberekeningen per verzoek;
- `GET /api/health` voor de databaseconfiguratiestatus.

De import-upload gebruikt `multipart/form-data` met:

- `file`: maximaal 10 MB, uitsluitend `.xlsx`;
- optioneel `actorId`: UUID van een bestaande actieve gebruiker; zonder dit veld wordt de serverinstelling `KEYFLOW_IMPORT_ACTOR_ID` gebruikt.

Een werkboek met harde fouten of mogelijke dubbelen krijgt status `needs_review`. Alleen een foutvrije analyse krijgt status `ready`; er wordt in deze stap nog niets naar de live voorraad geschreven.

Harde fouten kunnen niet alleen met een notitie worden weggeklikt. Een beheerder moet de waarde corrigeren of de volledige bronrij uitsluiten. SKU, aantal en layout worden opnieuw gevalideerd voordat de afhandeling wordt opgeslagen.

De ontwikkelmigratie maakt hiervoor een lokale beheerder aan met UUID `00000000-0000-0000-0000-000000000001`. Dit is uitsluitend auditidentiteit; gebruikersauthenticatie wordt vóór productie apart aangesloten.

## Excel controleren

```text
cd app
npm run import:analyze -- "C:\pad\naar\Toetsenbordstickers voorraad.xlsx"
```

De huidige bron levert 148 regels en 3.218 stuks op. De validator vindt 3 harde artikelnummervouten, 31 compatibiliteitswaarschuwingen en 9 mogelijke dubbele SKU/modelgroepen die vóór definitieve import moeten worden beoordeeld.

## Documentatie

- `docs/PRODUCT_ROADMAP.md` — gewogen voortgang naar de volledige productieversie;
- `ONDERZOEKSRAPPORT_FASE_1.pdf` — goedgekeurde onderzoeksbasis;
- `docs/DEPLOYMENT.md` — voorgestelde GitHub- en productie-uitrol;
- `app/Dockerfile` — productiecontainer;
- `.github/workflows` — geautomatiseerde controles en image-publicatie.
