# Uitproberen zonder de productiedata te raken

De dev-server praat standaard tegen dezelfde Neon-database als de live app. Een
testronde die je daar aanmaakt staat meteen bij Noviply in beeld. Voor het
uitproberen van iets dat schrijft is er daarom een apart schema.

## Zo werkt het

1. `create schema rekey_proef`
2. Alle migraties daarin draaien.
3. Een dev-server starten met `DATABASE_URL` = de **unpooled** URL plus
   `?options=-c%20search_path%3Drekey_proef`.
4. Achteraf `drop schema rekey_proef cascade`.

Het schema heeft eigen tabellen; `public` blijft onaangeroerd.

## De valkuil — lees dit voordat je begint

**Voer nooit `set search_path` uit over de pooled `DATABASE_URL`.**

Die URL gaat via een pgbouncer die serververbindingen deelt met iedereen, dus
ook met de live app. Een `SET` blijft op zo'n gedeelde verbinding staan nadat
jij klaar bent. Verwijder je daarna het proefschema, dan zoekt de live app zijn
tabellen in een schema dat niet meer bestaat en geeft elke query
`relation "print_batches" does not exist`.

Dat is één keer gebeurd, op 1 augustus 2026: de hele app gaf 500 terwijl er
21 openstaande regels voor Noviply klaarstonden. Alleen zichtbaar aan de
buitenkant — in de database was alles nog heel.

Gebruik dus:

- `DATABASE_URL_UNPOOLED` zodra je een `search_path` nodig hebt, en zet die in
  de connectiestring (`?options=-c%20search_path%3D…`) in plaats van met een
  `SET` erna. Een connectiestring geldt per verbinding en lekt niet.
- De pooled URL alleen voor gewone queries die volledig gekwalificeerd zijn
  (`public.print_batches`) of die niets aan de sessie veranderen.

Als het tóch misgaat: de standaard staat sinds die dag vast met
`alter role … set search_path to "$user", public` en hetzelfde op de database,
dus een verbinding die gereset wordt komt goed terug. Je kunt de pool leegtrekken
door een paar dozijn verbindingen te openen en op elk `reset search_path` en
`discard all` te doen; daarna nameten met `show search_path`.
