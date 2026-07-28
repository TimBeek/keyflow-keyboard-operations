# Persoonlijke toegang via Microsoft Entra ID

KeyFlow ondersteunt een productie-login met persoonlijke Microsoft-werkaccounts. De huidige private Sites-preview blijft in `pilot`-modus totdat de echte database en Entra-appregistratie beschikbaar zijn.

## Beveiligingsmodel

- KeyFlow gebruikt OpenID Connect via de tenantgebonden Microsoft Entra v2.0-issuer.
- Een sessie duurt maximaal acht uur.
- De Entra-object-id wordt samen met de tenant-id als stabiele externe gebruikerssleutel opgeslagen.
- Een gebruiker zonder expliciete KeyFlow-app-rol wordt geweigerd.
- `KeyFlow.Management` krijgt de managementrechten.
- `KeyFlow.Employee` krijgt uitsluitend uitvoering, voorraad bekijken en dagelijkse voorraadmutaties.
- Wanneer Entra actief is, negeren beveiligde API-routes een meegestuurde `actorId` en gebruiken zij de persoonlijke sessie.
- Gedeactiveerde databasegebruikers kunnen niet opnieuw aanmelden.

Microsoft adviseert voor nieuwe applicaties app-rollen boven algemene groepsclaims. App-rollen voorkomen token-overflow en maken de betekenis van een rol onafhankelijk van tenant-specifieke groepsnamen.

## Entra-appregistratie

1. Registreer een single-tenant webapplicatie in Microsoft Entra ID.
2. Voeg als redirect-URI toe:
   `https://<productiedomein>/api/auth/callback/microsoft-entra-id`
3. Maak de app-rollen `KeyFlow.Employee` en `KeyFlow.Management` aan met `Users/Groups` als toegestaan lidtype.
4. Wijs werknemers en managementgroepen in de Enterprise Application aan de juiste app-rol toe.
5. Schakel waar mogelijk `Assignment required` in, zodat alleen toegewezen accounts kunnen aanmelden.
6. Maak een clientsecret met een beheerde vervaldatum en bewaar uitsluitend de secretwaarde in de hostingomgeving.

## Productievariabelen

Gebruik `.env.example` als namenlijst. Secrets horen nooit in GitHub:

- `KEYFLOW_AUTH_MODE=entra`
- `KEYFLOW_BASE_URL=https://<productiedomein>`
- `AUTH_SECRET` met minimaal 32 willekeurige tekens
- `AUTH_TRUST_HOST=true`
- `AUTH_MICROSOFT_ENTRA_ID_ID`
- `AUTH_MICROSOFT_ENTRA_ID_SECRET`
- `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0`
- `DATABASE_URL`

## Controle

- `GET /api/health` geeft zonder secretwaarden aan welke configuratieonderdelen gereed zijn.
- `GET /api/readiness` geeft pas HTTP 200 wanneer alle productievariabelen geldig zijn én PostgreSQL bereikbaar is.
- Activeer `KEYFLOW_AUTH_MODE=entra` pas nadat de echte configuratie en database gereed zijn.

## Nog extern uit te voeren

De code, sessies, rolmapping, gebruikerssynchronisatie en API-afscherming zijn aanwezig. Voor operationele vrijgave moeten nog een echte Entra-appregistratie, groepen/gebruikers, MFA/Conditional Access, beheerde PostgreSQL en een eigen productiehost worden ingericht en geaccepteerd.
