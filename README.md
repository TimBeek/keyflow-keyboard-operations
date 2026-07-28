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
- de volledige checksum-gebonden Excelcatalogus met alle 148 hangmaplocaties en 3.218 vellen;
- veilige blokkering van 9 regels met ontbrekende of dubbele artikelnummers;
- zoeken via alle bruikbare gekoppelde modellen uit Excel, niet alleen via het hoofdmodel;
- een managementwachtrij voor model-layoutcombinaties die naar meerdere kandidaat-SKU's verwijzen;
- een formuleveilige CSV-export van de volledige voorraadcatalogus;
- automatisch besteladvies op basis van verbruik, levertijd, veiligheidsvoorraad en open bestellingen;
- een interne conceptbestelling, modelgroepenoverzicht en 1/3/6-maandsrapportage;
- gescheiden management- en werknemersweergaven;
- rolgebaseerde serverpermissies voor voorraaduitvoering en importbeheer;
- een vereenvoudigde werknemersflow met methodeadvies, werkinstructies en aftekenlijst;
- exact oud Noviply-advies met het fysieke hangmapnummer uit Excel, SKU, layout en zichtbare E1/E2-variant;
- een verplichte vijfpuntscontrole vóór het aanbrengen en afboeken van een oud Noviply-vel;
- afzonderlijke registratie van een ongebruikte afwijking of werkelijk verbruikte/beschadigde uitval;
- werknemersboekingen voor leveranciersontvangsten en niet-passende stickers;
- scanner-first orderinvoer met automatische doorgang na Enter of Tab;
- automatische orderlookup die bij bekende barcodes model, waardeklasse en layouts invult en geblokkeerde orders tegenhoudt;
- korte modelnummerinvoer (`5420`) met automatische resolutie of een beperkte keuzelijst;
- vaste verkoopwaardeklassen in plaats van handmatige bedragen;
- een managementwerkruimte voor transacties, ABC-classificatie en configureerbaar conversiebeleid;
- een blinde fysieke hangmaptelling met verschiltoelichting, automatische correctie en blijvend controlebewijs;
- locatiegebonden voorraadstanden, zodat een dubbel of ontbrekend SKU nooit twee fysieke hangmappen als één voorraadpositie behandelt;
- een managementoverzicht van geslaagde en mislukte hangmap-, E1/E2- en positioneringscontroles;
- een werknemersgids met eigen trainingsillustratie voor E1/E2, toetsvorm en droge pascontrole;
- afzonderlijke, zelf gegenereerde Dell Latitude-stijl E1- en E2-controlebeelden met orderafhankelijke variantmarkering;
- Scandinavische invoer als gebruikelijke startkeuze, met verplichte specificatie naar Zweeds/Fins, Noors of Deens;
- een databasestructuur voor door management goedgekeurde layout-, model- en variantreferenties;
- een AI-ondersteunde modelgroepwachtrij met bronconflicten en verplichte menselijke bewijscontrole;
- een fysieke compatibiliteitsbibliotheek die afwijzingen direct uit het werknemersadvies houdt;
- een tenantgebonden Microsoft Entra ID-loginbasis met persoonlijke app-rollen, databasesynchronisatie en afgeschermde productie-API's;
- een checksum-gebonden productiepreflight, transactionele beginimport en verificatie voor alle 148 Excelbronregels;
- productie-health- en readinesscontroles die ontbrekende configuratie melden zonder secrets te lekken;
- een management-continuïteitsdashboard met RPO/RTO, vijf herstelcontroles en expliciete externe go-livepoorten;
- geautoriseerde, idempotente PostgreSQL-opslag van herstelproeven plus een alleen-lezen operationele readinesscheck;
- automatische omschakeling van lokale pilotcontinuïteit naar persoonlijke, centrale PostgreSQL-synchronisatie in Entra-modus;
- versiegebonden en gevalideerde lokale pilotopslag die boekingen en beleid na een herstart van de browser herstelt;
- JSON-back-up, gecontroleerd herstel en een tweestapsreset voor management;
- een productiebuild zonder lint- of TypeScriptfouten;
- een containerdefinitie en GitHub Actions voor CI, een echte PostgreSQL-bootstraptest en image-publicatie.

De pilotmutaties blijven nu bewaard in de browser van het gebruikte apparaat. Dit voorkomt gegevensverlies bij verversen of herstarten en management kan een gevalideerde JSON-back-up downloaden en herstellen. Deze lokale opslag is nog geen centrale, gelijktijdige multi-userdatabase; daarvoor wordt de aanwezige PostgreSQL-laag aangesloten.

De server-side transactielaag is al aanwezig en wordt actief zodra `DATABASE_URL` is ingesteld en de migratie is uitgevoerd.

In het bronbestand is `nr.` de fysieke locatie in de genummerde hangmappenwagen. De import behandelt dit daarom als `storageNumber`, controleert op ontbrekende en dubbele nummers en bewaart het in productie als `hanging_file_number`.

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
npm run db:preflight
npm run db:bootstrap:apply
npm run db:recovery:smoke
npm run db:operations:check
npm run db:verify
```

De database-API's zijn daarna beschikbaar via:

- `POST /api/inventory/mutations` voor een idempotente voorraadmutatie;
- `POST /api/inventory/counts` voor een idempotente fysieke hangmaptelling en eventuele correctie;
- `POST /api/model-groups/reviews` voor een geautoriseerde, idempotente managementbeoordeling met verplicht fysiek bewijs;
- `POST /api/compatibility/evidence` voor goedgekeurde of afgewezen model/SKU-pastesten;
- `GET` en `POST /api/operations/recovery-drills` voor managementrapportage en herstelproefbewijs;
- `GET /api/operations/readiness` voor een geautoriseerde runtimecontrole van migratie, bron, voorraadsluiting en herstelbewijs;
- `GET` en `POST /api/operations/workfloor-trials` voor open, geslaagde of mislukte werkvloerproeven met harde bewijsregels;
- `GET` en `POST /api/operations/go-live-acceptance` voor het persoonlijke, centrale `5/5`-vrijgavedossier met serverberekende status;
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

De gecontroleerde applicatieseed opnieuw genereren:

```text
cd app
npm run inventory:seed -- "C:\pad\naar\Toetsenbordstickers voorraad.xlsx"
```

De generator weigert een bron die niet exact 148 unieke hangmappen en 3.218 vellen bevat. De resulterende seed bewaart ook de SHA-256 van het bronbestand.

## Documentatie

- `docs/PRODUCT_ROADMAP.md` — gewogen voortgang naar de volledige productieversie;
- `docs/EMPLOYEE_WORKFLOW.md` — scanner-, modelnummer- en waardeklasseflow voor werknemers;
- `docs/PILOT_PERSISTENCE_AND_ORDER_LOOKUP.md` — orderlookup, lokale pilotopslag, back-up en productiegrenzen;
- `docs/HANGING_FILE_VERIFICATION.md` — hangmaplocaties en de verplichte controle vóór Noviply-afboeking;
- `docs/CYCLE_COUNTS.md` — fysieke hangmaptelling, verschilafhandeling en centrale API;
- `docs/KEYBOARD_LAYOUT_REFERENCE.md` — Scandinavische herkenning, E1/E2-pasvormcontrole en referentiebeheer;
- `docs/GO_LIVE_INPUTS.md` — exacte toegangen, gegevens en acceptatiebewijzen die nog nodig zijn voor 100%;
- `docs/GO_LIVE_ACCEPTANCE_DOSSIER.md` — vijf formele vrijgavepoorten, bewijsregels en centrale audit;
- `docs/WORKFLOOR_ACCEPTANCE_TRIALS.md` — echte scanner-/apparaatproeven, harde slagingsregels en scheiding van go-livegoedkeuring;
- `docs/OPERATIONAL_SCENARIOS.md` — 29 reproduceerbare normale, grens- en foutscenario’s met managementrapport;
- `docs/PRODUCTION_COMPLETION_AUDIT.md` — requirementmatrix met bewijs, ontbrekende aansluitingen en actuele status;
- `docs/AI_MODEL_GROUP_DATA_REQUIREMENTS.md` — vereiste bron- en validatiedata voor veilige AI-modelgroepvoorstellen;
- `docs/MODEL_GROUP_REVIEW.md` — werkende managementwachtrij, bewijsvelden en goedkeuringsregels;
- `docs/COMPATIBILITY_EVIDENCE.md` — fysieke pastesten, werknemersblokkades en centrale bewijs-API;
- `docs/IDENTITY_AND_SSO.md` — Entra-appregistratie, persoonlijke app-rollen, sessies en productieconfiguratie;
- `docs/PRODUCTION_DATABASE_BOOTSTRAP.md` — veilige preflight, eenmalige beginimport en verificatie;
- `ONDERZOEKSRAPPORT_FASE_1.pdf` — goedgekeurde onderzoeksbasis;
- `docs/DEPLOYMENT.md` — voorgestelde GitHub- en productie-uitrol;
- `app/Dockerfile` — productiecontainer;
- `.github/workflows` — geautomatiseerde controles en image-publicatie.
