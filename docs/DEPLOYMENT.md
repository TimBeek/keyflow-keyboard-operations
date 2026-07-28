# Deployment via GitHub

## Voorgestelde productieopzet

GitHub beheert de broncode en automatiseert controles en uitrol. GitHub zelf is niet de applicatieserver en bewaart geen productievoorraad.

1. Ontwikkeling gebeurt op een featurebranch.
2. Een pull request start linting, security-audit en productiebuild.
3. Na review wordt de pull request naar `main` gemerged.
4. Een release-tag zoals `v0.1.0` bouwt een onveranderbaar containerimage.
5. GitHub Actions publiceert dat image in GitHub Container Registry (GHCR).
6. De productieomgeving haalt exact dat image op en start een nieuwe revisie.
7. Databasemigraties worden als gecontroleerde deploymentstap uitgevoerd.
8. Bij problemen wordt teruggerold naar het vorige image; voorraadtransacties worden nooit teruggedraaid door een software-rollback.

## Hostingadvies

Aanbevolen:

- Azure Container Apps voor de webapp;
- Azure Database for PostgreSQL Flexible Server voor de database;
- Microsoft Entra ID voor medewerkerslogin;
- Azure Blob Storage voor foto’s, pakbonnen en compatibiliteitsbewijs;
- Azure Key Vault voor productiegeheimen;
- Azure Monitor/Application Insights voor logging en waarschuwingen.

Dit sluit goed aan op een interne bedrijfsapp, ondersteunt private toegang en kan vanuit GitHub Actions worden gedeployed. Een andere beheerde containerhost kan later worden gekozen zonder de applicatie opnieuw te ontwerpen.

## GitHub-omgevingen

- `staging`: automatische uitrol vanaf een release candidate;
- `production`: uitrol na expliciete goedkeuring;
- secrets en cloudidentiteit per omgeving gescheiden;
- productie alleen vanaf release-tags;
- één deployment tegelijk via een concurrency-regel.

Gebruik bij voorkeur OpenID Connect tussen GitHub en Azure. Daarmee is geen langlevend Azure-wachtwoord in GitHub nodig.

## Wat al aanwezig is

- `.github/workflows/ci.yml`: controleert iedere pull request en push naar `main`;
- `.github/workflows/container.yml`: bouwt en publiceert een container bij een versie-tag of handmatige start;
- `app/Dockerfile`: reproduceerbare productiecontainer;
- `app/next.config.ts`: Next.js standalone output voor een kleine runtimecontainer.
- `app/scripts/check-operational-readiness.ts`: bewaakt migratie, bronsnapshot, voorraadsluiting en de nieuwste herstelproef zonder gegevens te wijzigen.

## Nog nodig voor echte productie

1. Een private GitHub-repository en eigenaar/organisatie.
2. Keuze en toegang tot een Azure-subscription en regio, bij voorkeur West Europe.
3. DNS-naam, bijvoorbeeld `keyflow.bedrijf.nl`.
4. Entra ID-groep voor operators, beheerders, planners en auditors.
5. Staging- en productie-resources.
6. GitHub OIDC-federation naar Azure.
7. Databaseverbinding en migratieworkflow.
8. Back-up-, herstel- en bewaartermijnbesluit plus een echte herstelproef buiten productie.
9. Eerste fysieke telling vóór productieve ingebruikname.

## Waarom geen GitHub Pages

GitHub Pages levert statische bestanden. Deze applicatie heeft veilige serverlogica, rollen, mutaties, een audittrail en PostgreSQL nodig. Pages is daarom alleen geschikt voor documentatie, niet voor het voorraadsysteem.
