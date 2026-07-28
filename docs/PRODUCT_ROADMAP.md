# KeyFlow productieroadmap

De voortgang wordt gemeten richting een volledige productieversie, niet alleen richting een visueel prototype.

## Huidige voortgang: 96%

| Onderdeel | Gewicht | Gereed |
|---|---:|---:|
| Onderzoek, functioneel ontwerp en UX-basis | 10% | 10% |
| Applicatiebasis, CI, private hosting en securitycontroles | 10% | 10% |
| Excel-import, staging, correcties en audit | 15% | 14% |
| Voorraadcatalogus, transactieregels en scannerworkflow | 15% | 15% |
| Vier conversiemethoden en werknemersuitvoering | 10% | 10% |
| Forecasting, besteladvies en managementrapportages | 10% | 9% |
| Rollen, permissies en gebruikerservaring per rol | 10% | 10% |
| Live PostgreSQL, back-up, herstel en monitoring | 8% | 7% |
| Persoonlijke authenticatie/SSO en sessiebeveiliging | 5% | 4% |
| Externe koppelvlakken en productieacceptatieproces | 7% | 7% |
| **Totaal** | **100%** | **96%** |

## Eerstvolgende fasen

1. Een beheerde PostgreSQL-omgeving beschikbaar maken, de gebouwde preflight uitvoeren en de 139 operationele plus 9 geblokkeerde bronregels gecontroleerd toepassen.
2. De gebouwde Entra-login met de echte tenant, appregistratie, app-rollen, MFA en productiehost configureren en accepteren.
3. De orderlookup-adapter op het werkelijke order- of ERP-systeem aansluiten.
4. De scanner-first invoer, hangmapnummers en vijfpuntscontrole met de werkelijke scanners, hangmappenwagen en tablets op de werkvloer accepteren.
5. De gebouwde fysieke bewijsbibliotheek met echte E1/E2-, onderdeelnummer-, afmetings-, foto- en pastestrecords vullen en door management laten aftekenen.
6. De gebouwde AI-ondersteunde modelgroepwachtrij met echte onderdeelnummer-, foto- en pastestbewijzen vullen en daarna centraal synchroniseren.
7. Leveranciersbestellingen, laptopdatabase en eventuele ERP/Magento-koppelingen aansluiten.
8. De gebouwde herstelregistratie en readinesscheck op de beheerde database aansluiten, een echte providerrestore uitvoeren en cloudmonitoring/alarmering activeren.

De applicatie bevat nu de volledige, checksum-gebonden Excelmomentopname: 148 unieke hangmaplocaties, 3.218 vellen, 139 veilig operationele regels en 9 geblokkeerde regels met ontbrekende of dubbele artikelnummers. Alle gekoppelde modellen zijn doorzoekbaar, conflicterende SKU-koppelingen worden automatisch in een managementwachtrij gezet en de volledige catalogus kan veilig als CSV worden geëxporteerd. De bronkoppelingen zijn nadrukkelijk nog geen fysieke compatibiliteitsgoedkeuring.

De huidige 7% voor database/back-up omvat naast de pilotpersistentie en het databaseschema nu een checksum-gebonden JSON-bron, migraties `0013`, `0014` en `0015`, een alleen-lezen productiepreflight, een eenmalige transactionele bootstrap, volledige verificatie achteraf, geautoriseerde herstelproefregistratie en een operationele readinesscheck. De managementtab scheidt interne techniek van externe go-livepoorten en bewaart RPO/RTO plus vijf integriteitscontroles. CI test de centrale registratiepaden op tijdelijke PostgreSQL. De code is getest, maar nog niet op een beheerde database uitgevoerd; een echte providerback-up/restore en cloudalarmering blijven extern vereist.

Het productieacceptatieproces is nu compleet aangestuurd: management heeft vijf expliciete vrijgavepoorten, verplichte vierpuntscontrole, bewijsreferentie en -datum, persoonlijke audit, afwijzing met vervolgactie en een harde `5/5`-vrijgaveblokkade. Pilotdata en centrale Entra-data blijven gescheiden. Dit maakt de echte acceptatie aantoonbaar uitvoerbaar, maar markeert geen enkele externe test automatisch als geslaagd.

Iedere poort bevat daarnaast een eigen vierpunts-bewijschecklist. De centrale API levert een serverberekende vrijgavestatus, de interface bundelt alle open acties en management kan de actuele stand als versieerbare JSON of afdrukbaar PDF-dossier overdragen. Deze bouwbare ondersteuning verhoogt het percentage bewust niet: alleen werkelijk uitgevoerde externe acceptaties vullen de resterende 4%.

De huidige 4% voor persoonlijke authenticatie omvat de tenantgebonden Microsoft Entra ID/OIDC-flow, achtuurs JWT-sessies, expliciete `KeyFlow.Employee`- en `KeyFlow.Management`-app-rollen, automatische databasegebruikerssynchronisatie, server-side vervanging van actor-id's en de nu werkelijk sessiegebonden centrale herstel-/readiness-synchronisatie. Pilotdata kan deze centrale historie niet overschrijven. De echte tenantregistratie, toegewezen gebruikers/groepen, MFA/Conditional Access en operationele acceptatie ontbreken nog.

Het percentage wordt alleen verhoogd nadat een onderdeel is geïmplementeerd, getest, naar GitHub gepusht en in de private live-omgeving gepubliceerd.
