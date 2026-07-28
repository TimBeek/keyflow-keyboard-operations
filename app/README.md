# KeyFlow webapp

Next.js 16-app voor de werknemers- en managementflow van KeyFlow Keyboard Operations.

## Starten

```text
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verplichte controles

```text
npm audit --audit-level=high
npm run test
npm run lint
npm run build
```

## Excelbron opnieuw genereren

```text
npm run inventory:seed -- "C:\pad\naar\Toetsenbordstickers voorraad.xlsx"
```

De generator accepteert alleen de gecontroleerde momentopname met 148 unieke hangmappen en 3.218 vellen en schrijft een checksum-gebonden TypeScriptseed plus een JSON-bron voor de productiedatabase. Regels met ontbrekende of dubbele artikelnummers blijven zichtbaar voor management, maar zijn geblokkeerd voor operationele boekingen.

## Centrale productie

De server-API en migraties gebruiken PostgreSQL zodra `DATABASE_URL` is ingesteld. Zonder centrale database draait de live werknemersflow bewust in lokale pilotmodus; de echte order-API en formele fysieke acceptatie blijven aparte go-livevoorwaarden. Zie `../docs/GO_LIVE_INPUTS.md` en `../docs/PRODUCTION_COMPLETION_AUDIT.md`.

De eenmalige productievoorraadroute gebruikt achtereenvolgens `db:migrate`, `db:preflight`, `db:bootstrap:apply`, `db:operations:check` en `db:verify`. De standaardopdracht `db:bootstrap` is een droge broncontrole zonder databasewijziging. CI controleert het herstelregistratiepad afzonderlijk met `db:recovery:smoke`. Zie `../docs/PRODUCTION_DATABASE_BOOTSTRAP.md`.

De Microsoft Entra ID/OIDC-loginbasis gebruikt app-rollen `KeyFlow.Employee` en `KeyFlow.Management`, synchroniseert persoonlijke accounts met de database en vervangt in productiemodus meegestuurde actor-id's door de beveiligde sessie-identiteit. `/api/health` meldt ontbrekende configuratie zonder secrets te tonen en `/api/readiness` wordt pas groen wanneer ook PostgreSQL bereikbaar is. De private preview blijft in pilotmodus totdat de echte Entra-registratie en productieomgeving zijn ingevuld. Zie `../docs/IDENTITY_AND_SSO.md`.

Management kan in `Beheer & analyse` onder `Voorraad tellen` iedere fysieke hangmap blind tellen. Een verschil vereist een toelichting en maakt precies één herleidbare correctieboeking. De centrale route is `POST /api/inventory/counts`; migratie `0010_stock_counts.sql` bewaart ook kloppende tellingen als controlebewijs.

Onder `AI-modelgroepen` analyseert KeyFlow gedeelde SKU-, layout-, E1/E2- en modelbrondata. Management kan een voorstel alleen goedkeuren nadat onderdeelnummer, foto, variant en droge pastest expliciet zijn bevestigd. Besluiten worden lokaal in de pilotback-up bewaard; migratie `0011_model_group_review.sql` bereidt de centrale auditwachtrij voor.

Onder `Bewijsbibliotheek` legt management iedere fysieke model/SKU-pastest afzonderlijk vast. Een goedkeuring vereist vijf vormcontroles, onderdeelnummer, afmetingen en fotoreferentie. Een laatste afwijzing blokkeert de oude Noviply-methode voor dat exacte model in de werknemersflow. Migratie `0012_compatibility_evidence.sql` en `POST /api/compatibility/evidence` bereiden centrale opslag voor.

Onder `Continuïteit` ziet management zeven productiepoorten en registreert het een echt uitgevoerde herstelproef met RPO/RTO en vijf integriteitscontroles. Migratie `0014_recovery_drills.sql`, `GET/POST /api/operations/recovery-drills`, `GET /api/operations/readiness` en `db:operations:check` ondersteunen centrale audit en bewaking. Pilotmodus blijft lokaal; Entra-modus schakelt automatisch naar persoonlijke PostgreSQL-synchronisatie en voorkomt dat een pilotback-up de centrale historie overschrijft. De registratie voert zelf nooit een providerrestore uit. Zie `../docs/RECOVERY_AND_OPERATIONAL_READINESS.md`.
