# Fysieke hangmaptelling

KeyFlow registreert fysieke tellingen op de genummerde hangmap, omdat `nr.` de werkelijke voorraadlocatie is. Het SKU blijft zichtbaar als controlelabel, maar is niet de primaire identiteit van een voorraadpositie. Dit voorkomt dat twee bronregels met hetzelfde of een ontbrekend artikelnummer onbedoeld dezelfde voorraad delen.

## Managementflow

Open `Beheer & analyse` en kies `Voorraad tellen`.

1. Zoek de hangmap op nummer.
2. Tel de aanwezige vellen.
3. Vul alleen het getelde gehele aantal in.
4. Voeg bij een verschil een concrete toelichting van minimaal drie tekens toe.
5. Sla de telling op en controleer de bevestiging.

Het invoerveld voor de telling blijft bewust leeg wanneer een andere hangmap wordt gekozen. De systeemstand staat daarnaast als referentie, zodat de medewerker geen reeds ingevuld aantal per ongeluk bevestigt.

Een kloppende telling blijft als bewijs zichtbaar. Een tekort of overschot:

- zet de actuele voorraad exact op het getelde aantal;
- maakt één correctietransactie met het getelde verschil;
- bewaart verwachte stand, getelde stand, verschil, reden, tijdstip en uitvoerder;
- blijft na export en herstel van een pilotback-up beschikbaar.

Een geblokkeerde bronregel mag wel worden geteld, omdat de fysieke voorraad moet kunnen worden vastgesteld. Normale uitgifte of ontvangst blijft geblokkeerd totdat management de datakwaliteit heeft opgelost.

## Centrale API

Na configuratie van PostgreSQL gebruikt de centrale implementatie:

```text
POST /api/inventory/counts
```

Voorbeeld:

```json
{
  "locationCode": "MAIN",
  "storageNumber": 75,
  "countedQuantity": 24,
  "notes": "Eén vel beschadigd aangetroffen",
  "idempotencyKey": "count-2026-07-28-main-75",
  "actorId": "00000000-0000-0000-0000-000000000001"
}
```

De server controleert de permissie `inventory.mutate`, vergrendelt gelijke idempotente verzoeken, vergrendelt de voorraadbalans en voert telling, correctie en audit in één databasetransactie uit. Een retry met dezelfde sleutel retourneert de bestaande telling en past de voorraad niet opnieuw aan.

Migratie `0010_stock_counts.sql` voegt de telkoppen en telregels toe. Voor productie moet de lokale auditidentiteit worden vervangen door de persoonlijke SSO-gebruiker.

## Go-livecontrole

Voor formele vrijgave zijn nog nodig:

- migraties `0001` tot en met `0010` op de beheerde database;
- een ondertekende begintelling van alle 148 hangmappen;
- een gelijktijdigheidstest met twee apparaten;
- controle dat twee gelijke retries maar één voorraadcorrectie opleveren;
- een vastgelegde back-up- en hersteltest waarin de tellingen terugkomen.
