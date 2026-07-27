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
- een Excel-analysecommando dat importfouten, waarschuwingen en mogelijke dubbelen rapporteert;
- een productiebuild zonder lint- of TypeScriptfouten;
- een containerdefinitie en GitHub Actions voor CI en image-publicatie.

De mutaties zijn in deze ontwikkelversie alleen actief binnen de geopende browsersessie. Duurzame opslag en gebruikersauthenticatie worden aangesloten zodra de PostgreSQL- en hostingomgeving beschikbaar zijn.

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

## Excel controleren

```text
cd app
npm run import:analyze -- "C:\pad\naar\Toetsenbordstickers voorraad.xlsx"
```

De huidige bron levert 148 regels en 3.218 stuks op. De validator vindt 3 harde artikelnummervouten, 31 compatibiliteitswaarschuwingen en 9 mogelijke dubbele SKU/modelgroepen die vóór definitieve import moeten worden beoordeeld.

## Documentatie

- `ONDERZOEKSRAPPORT_FASE_1.pdf` — goedgekeurde onderzoeksbasis;
- `docs/DEPLOYMENT.md` — voorgestelde GitHub- en productie-uitrol;
- `app/Dockerfile` — productiecontainer;
- `.github/workflows` — geautomatiseerde controles en image-publicatie.
