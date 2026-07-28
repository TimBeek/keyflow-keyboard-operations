# Herstelproeven en operationele readiness

KeyFlow registreert herstelbewijs zonder een providerback-up of restore te simuleren. Een herstelproef telt pas als geslaagd wanneer deze buiten productie is uitgevoerd en alle vijf integriteitscontroles positief zijn.

## Managementflow

Open `Beheer & analyse` en daarna `Continuïteit`.

1. Herstel een herkenbare providerback-up naar `staging` of een geïsoleerde `recovery`-omgeving.
2. Noteer de herleidbare back-upreferentie, start- en eindtijd en de gemeten RPO/RTO.
3. Controleer migraties, bronsnapshot, voorraadbalansen, transactielog en toegangsrechten.
4. Registreer `Geslaagd` alleen als alle vijf controles positief zijn.
5. Leg bij `Mislukt` minimaal de oorzaak en vervolgactie vast en voer na herstel een nieuwe proef uit.

De browserpilot bewaart deze historie in de versie-1-JSON-back-up. Bestaande versie-1-back-ups zonder herstelhistorie blijven geldig en krijgen een lege lijst.

## Centrale opslag

Migratie `0014_recovery_drills.sql` voegt een idempotente, geautoriseerde bewijsregistratie toe. De API is:

- `GET /api/operations/recovery-drills` voor managementrapportage;
- `POST /api/operations/recovery-drills` voor een herstelproefregistratie.
- `GET /api/operations/readiness` voor migratie-, bron-, voorraad- en herstelstatus.

In productiemodus komt de actor altijd uit de persoonlijke Entra-sessie. Schrijven vereist `policies.manage`; lezen vereist `reports.view`. Een productierestore is als doelomgeving bewust niet toegestaan.

De managementinterface schakelt automatisch om: pilotmodus leest en schrijft de versieerbare lokale back-up, Entra-modus leest en schrijft PostgreSQL. Een lokale back-up of reset kan de centrale herstelhistorie niet overschrijven. Bij netwerkuitval blijft de fout zichtbaar en kan management de runtimecontrole handmatig opnieuw laden.

## Geautomatiseerde controles

Na migratie en de gecontroleerde voorraadbootstrap:

```text
npm run db:recovery:smoke
npm run db:operations:check
npm run db:verify
```

`db:recovery:smoke` valideert in CI alleen het registratie- en terugleespad op de tijdelijke PostgreSQL-database. Dit is geen providerrestore en levert geen productieacceptatiebewijs.

`db:operations:check` is alleen-lezen en blokkeert wanneer:

- migratie `0016` niet de nieuwste migratie is;
- de checksum-gebonden inventarissnapshot ontbreekt of afwijkt;
- voorraadbalansen en transactielog niet sluiten;
- de nieuwste herstelproef ontbreekt, is mislukt, controles mist of te oud is.

De maximale ouderdom staat in `KEYFLOW_RECOVERY_MAX_AGE_DAYS` en is standaard 90 dagen.

## Nog extern vereist

Voor een echte go-live blijven nodig:

- een beheerde PostgreSQL-omgeving met providerback-ups;
- vastgestelde RPO, RTO, retentie en verantwoordelijke;
- een werkelijk uitgevoerde restore buiten productie;
- export van providerlogs en de KeyFlow-registratie als acceptatiebewijs;
- periodieke herhaling en alarmering vanuit de gekozen cloudmonitoring.
