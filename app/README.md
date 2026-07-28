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

De generator accepteert alleen de gecontroleerde momentopname met 148 unieke hangmappen en 3.218 vellen en schrijft een checksum-gebonden TypeScriptseed. Regels met ontbrekende of dubbele artikelnummers blijven zichtbaar voor management, maar zijn geblokkeerd voor operationele boekingen.

## Centrale productie

De server-API en migraties gebruiken PostgreSQL zodra `DATABASE_URL` is ingesteld. Zonder centrale database draait de live werknemersflow bewust in lokale pilotmodus; persoonlijke SSO, de echte order-API en formele fysieke acceptatie zijn aparte go-livevoorwaarden. Zie `../docs/GO_LIVE_INPUTS.md` en `../docs/PRODUCTION_COMPLETION_AUDIT.md`.
