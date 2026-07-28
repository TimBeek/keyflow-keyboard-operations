# KeyFlow productieroadmap

De voortgang wordt gemeten richting een volledige productieversie, niet alleen richting een visueel prototype.

## Huidige voortgang: 92%

| Onderdeel | Gewicht | Gereed |
|---|---:|---:|
| Onderzoek, functioneel ontwerp en UX-basis | 10% | 10% |
| Applicatiebasis, CI, private hosting en securitycontroles | 10% | 10% |
| Excel-import, staging, correcties en audit | 15% | 14% |
| Voorraadcatalogus, transactieregels en scannerworkflow | 15% | 15% |
| Vier conversiemethoden en werknemersuitvoering | 10% | 10% |
| Forecasting, besteladvies en managementrapportages | 10% | 9% |
| Rollen, permissies en gebruikerservaring per rol | 10% | 10% |
| Live PostgreSQL, back-up, herstel en monitoring | 8% | 5% |
| Persoonlijke authenticatie/SSO en sessiebeveiliging | 5% | 3% |
| Externe koppelingen en productieacceptatie | 7% | 6% |
| **Totaal** | **100%** | **92%** |

## Eerstvolgende fasen

1. Een beheerde PostgreSQL-omgeving beschikbaar maken, de gebouwde preflight uitvoeren en de 139 operationele plus 9 geblokkeerde bronregels gecontroleerd toepassen.
2. De gebouwde Entra-login met de echte tenant, appregistratie, app-rollen, MFA en productiehost configureren en accepteren.
3. De orderlookup-adapter op het werkelijke order- of ERP-systeem aansluiten.
4. De scanner-first invoer, hangmapnummers en vijfpuntscontrole met de werkelijke scanners, hangmappenwagen en tablets op de werkvloer accepteren.
5. De gebouwde fysieke bewijsbibliotheek met echte E1/E2-, onderdeelnummer-, afmetings-, foto- en pastestrecords vullen en door management laten aftekenen.
6. De gebouwde AI-ondersteunde modelgroepwachtrij met echte onderdeelnummer-, foto- en pastestbewijzen vullen en daarna centraal synchroniseren.
7. Leveranciersbestellingen, laptopdatabase en eventuele ERP/Magento-koppelingen aansluiten.
8. Centrale back-up, herstel, monitoring, logging, privacy- en productieacceptatie afronden.

De applicatie bevat nu de volledige, checksum-gebonden Excelmomentopname: 148 unieke hangmaplocaties, 3.218 vellen, 139 veilig operationele regels en 9 geblokkeerde regels met ontbrekende of dubbele artikelnummers. Alle gekoppelde modellen zijn doorzoekbaar, conflicterende SKU-koppelingen worden automatisch in een managementwachtrij gezet en de volledige catalogus kan veilig als CSV worden geëxporteerd. De bronkoppelingen zijn nadrukkelijk nog geen fysieke compatibiliteitsgoedkeuring.

De huidige 5% voor database/back-up omvat naast de pilotpersistentie en het databaseschema nu een checksum-gebonden JSON-bron, migratie `0013`, een alleen-lezen productiepreflight, een eenmalige transactionele bootstrap en een volledige verificatie achteraf. De route bewaart alle 148 bronregels, maakt alleen de 139 veilige regels operationeel en weigert bestaande of afwijkende voorraad. De code is droog gevalideerd, maar nog niet op een beheerde database uitgevoerd; back-up, herstel en monitoring ontbreken nog. De 6% voor koppelingen/acceptatie betreft de vervangbare orderlookup-adapter, de complete scan-naar-adviesflow, de op werkvloerinformatie aangepaste hangmapcontrole, een desktop- en mobiel geteste Scandinavische/NL-US-herkenningsflow, de gecorrigeerde Dell Latitude-stijl E1/E2-gids op basis van het Enter-blok, de herleidbare modelgroepwachtrij en de werknemersblokkade na een afgewezen fysieke pastest. Centrale teamsynchronisatie, de werkelijke orderkoppeling, echte onderdeelnummer-/fotobewijzen en fysieke acceptatietests zijn nog niet gereed.

De huidige 3% voor persoonlijke authenticatie omvat de tenantgebonden Microsoft Entra ID/OIDC-flow, achtuurs JWT-sessies, expliciete `KeyFlow.Employee`- en `KeyFlow.Management`-app-rollen, automatische databasegebruikerssynchronisatie en server-side vervanging van meegestuurde actor-id's door de persoonlijke sessie. De echte tenantregistratie, toegewezen gebruikers/groepen, MFA/Conditional Access en operationele acceptatie ontbreken nog.

Het percentage wordt alleen verhoogd nadat een onderdeel is geïmplementeerd, getest, naar GitHub gepusht en in de private live-omgeving gepubliceerd.
