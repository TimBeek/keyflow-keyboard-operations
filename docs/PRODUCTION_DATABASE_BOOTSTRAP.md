# Productiedatabase veilig initialiseren

KeyFlow bevat een gecontroleerde, transactionele route om de huidige Excelvoorraad één keer in een lege PostgreSQL-productiedatabase te laden. De bron is checksum-gebonden en bewaart ook regels die nog niet veilig boekbaar zijn.

## Vastgelegde bron

- Bestand: `Toetsenbordstickers voorraad.xlsx`
- Werkblad: `Productie`
- SHA-256: `30f6d1884c081c6ef72e99f7db779a7ef5a878b12a76fcd1ab85bc42b616ef7a`
- 148 hangmapregels en 3.218 vellen in de volledige bron
- 139 operationele regels en 3.017 operationele vellen
- 9 geblokkeerde regels op hangmap 30, 36, 63, 92, 105, 110, 133, 147 en 148

De negen geblokkeerde regels blijven in `inventory_source_rows` beschikbaar voor managementcontrole. Ze maken geen SKU, voorraadbalans of openingstransactie aan.

## Veiligheidsregels

- De bootstrap werkt standaard als droge controle en schrijft dan niets.
- `--apply` werkt alleen als migratie `0013` aanwezig is.
- De importidentiteit moet actief zijn en `imports.manage` hebben.
- Alleen een lege productievoorraad wordt geaccepteerd.
- Een PostgreSQL advisory lock voorkomt twee gelijktijdige bootstraps.
- Snapshot, modellen, SKU's, compatibiliteit, balansen, openingstransacties en auditregel worden in één transactie geschreven.
- De SHA-256 en idempotentiesleutels voorkomen een tweede toepassing van dezelfde bron.
- Een fout rolt de volledige databasetransactie terug.

## Uitvoerprocedure

Voer vanuit `app` uit:

```text
npm ci
npm run inventory:seed -- "C:\pad\naar\Toetsenbordstickers voorraad.xlsx"
npm run db:bootstrap
```

De laatste opdracht moet exact 148 bronregels, 139 operationele regels, 9 geblokkeerde regels en 3.017 operationele vellen melden.

Stel daarna uitsluitend in de beveiligde productieomgeving in:

```text
DATABASE_URL=postgres://...
DATABASE_SSL=require
KEYFLOW_IMPORT_ACTOR_ID=<uuid-van-actieve-managementgebruiker>
```

Voer vervolgens in deze volgorde uit:

```text
npm run db:migrate
npm run db:preflight
npm run db:bootstrap:apply
npm run db:verify
```

`db:preflight` is alleen-lezen en controleert databasebereikbaarheid, alle migratiechecksums, de persoonlijke importpermissie en of de voorraad leeg is of dezelfde bron al bevat.

`db:verify` is eveneens alleen-lezen. Het vergelijkt de snapshot, bronregels, datakwaliteit, SKU-koppelingen, hangmapnummers, balansen en openingstransacties met het lokale checksum-gebonden broncontract.

Bij iedere pull request voert GitHub Actions deze migratie-, preflight-, bootstrap- en verificatieketen opnieuw uit tegen een lege tijdelijke PostgreSQL 16-database.

## Bewijs na uitvoering

Bewaar voor productievrijgave:

- uitvoer van `db:preflight`;
- snapshot-ID en SHA-256 uit `db:verify`;
- ondertekende fysieke begintelling per hangmap;
- tijdstip en uitvoerende persoonlijke managementgebruiker;
- back-up-ID van vóór ingebruikname;
- resultaat van een afzonderlijke hersteltest;
- gelijktijdigheidstest met twee werkplekken.

De bootstrapcode is gereed en lokaal droog gevalideerd. Er is nog geen beheerde productiedatabase aangesloten of gevuld; dat blijft een expliciete go-livehandeling.
