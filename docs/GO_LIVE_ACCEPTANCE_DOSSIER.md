# Formeel go-liveacceptatiedossier

KeyFlow bundelt de vijf externe productievoorwaarden in één managementdossier. De registratie maakt een echte test of goedkeuring niet na: zij bewaart alleen wie wat heeft beoordeeld, met welk bewijs en op welke datum.

## Vrijgavepoorten

| Poort | Minimaal bewijs |
|---|---|
| Database & herstel | Providerrestore buiten productie, gemeten RPO/RTO, sluitende databasecontrole en eigenaar |
| Entra & toegangsbeleid | Tenantconfiguratie, app-rollen, MFA/Conditional Access en toegangstest |
| Orderkoppeling | Testorders, veldmapping, foutscenario's en goedkeuring van de systeemeigenaar |
| Compatibiliteitsbewijs | Onderdeelnummers, foto's, E1/E2, afmetingen en fysieke droge pastesten |
| Werkvloeracceptatie | Scanner, werkstation, hangmappenwagen, medewerkers en timingmeting |

Iedere poort heeft steeds één actuele status: `In behandeling`, `Goedgekeurd` of `Afgewezen`. Een nieuwer besluit voor dezelfde poort vervangt alleen de actuele status; de volledige historie blijft auditbaar.

## Harde vrijgaveregels

Een goedkeuring wordt alleen geaccepteerd wanneer:

1. de scope en acceptatiecriteria zijn bevestigd;
2. de test werkelijk is uitgevoerd;
3. herleidbaar bewijs is toegevoegd;
4. de verantwoordelijke eigenaar akkoord heeft gegeven;
5. een bewijsreferentie en bewijsdatum zijn ingevuld.

Een afwijzing vereist een oorzaak en vervolgactie. Een open of afgewezen poort houdt de productievrijgave geblokkeerd. Alleen vijf actuele goedkeuringen geven `5/5` en maken formele vrijgave mogelijk.

## Managementflow

Open `Beheer & analyse` en daarna `Vrijgave`.

1. Selecteer de juiste go-livepoort.
2. Vul de verantwoordelijke eigenaar in.
3. Verwijs naar het echte ticket, rapport, providerlog of dossier en vul de bewijsdatum in.
4. Bevestig alleen controles die daadwerkelijk zijn uitgevoerd.
5. Leg het besluit en eventuele vervolgactie vast.
6. Controleer de vijf actuele poortkaarten en de besluithistorie.

Pilotmodus bewaart besluiten in de lokale KeyFlow-back-up en heeft geen productie-effect. Entra-modus leest en schrijft met de persoonlijke sessie naar PostgreSQL.

## Centrale opslag en autorisatie

Migratie `0015_go_live_acceptance.sql` voegt de idempotente auditregistratie toe.

- `GET /api/operations/go-live-acceptance` vereist `reports.view`.
- `POST /api/operations/go-live-acceptance` vereist `policies.manage`.
- In productiemodus komt de actor uit de persoonlijke Entra-sessie.
- Iedere mutatie schrijft tevens `operations.go_live_acceptance_recorded` naar de auditlog.

CI test op tijdelijke PostgreSQL alleen het centrale registratie-, autorisatie- en idempotentiepad met een besluit `In behandeling`. Dat is bewust geen externe goedkeuring.

## Nog nodig voor 100%

De vijf eigenaars moeten de echte aansluitingen en acceptatietesten uitvoeren en het bewijs in dit dossier registreren. Pas daarna kan management de vrijgave afronden. Zie `GO_LIVE_INPUTS.md` voor de vereiste invoer per poort.
