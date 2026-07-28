# KeyFlow productieroadmap

De voortgang wordt gemeten richting een volledige productieversie, niet alleen richting een visueel prototype.

## Huidige voortgang: 87%

| Onderdeel | Gewicht | Gereed |
|---|---:|---:|
| Onderzoek, functioneel ontwerp en UX-basis | 10% | 10% |
| Applicatiebasis, CI, private hosting en securitycontroles | 10% | 10% |
| Excel-import, staging, correcties en audit | 15% | 14% |
| Voorraadcatalogus, transactieregels en scannerworkflow | 15% | 15% |
| Vier conversiemethoden en werknemersuitvoering | 10% | 10% |
| Forecasting, besteladvies en managementrapportages | 10% | 9% |
| Rollen, permissies en gebruikerservaring per rol | 10% | 10% |
| Live PostgreSQL, back-up, herstel en monitoring | 8% | 3% |
| Persoonlijke authenticatie/SSO en sessiebeveiliging | 5% | 0% |
| Externe koppelingen en productieacceptatie | 7% | 6% |
| **Totaal** | **100%** | **87%** |

## Eerstvolgende fasen

1. De lokale pilotpersistentie vervangen door gedeelde PostgreSQL-opslag en de 139 operationele plus 9 geblokkeerde bronregels gecontroleerd migreren.
2. Persoonlijke login koppelen aan management- en werknemersrollen.
3. De orderlookup-adapter op het werkelijke order- of ERP-systeem aansluiten.
4. De scanner-first invoer, hangmapnummers en vijfpuntscontrole met de werkelijke scanners, hangmappenwagen en tablets op de werkvloer accepteren.
5. De gebouwde fysieke bewijsbibliotheek met echte E1/E2-, onderdeelnummer-, afmetings-, foto- en pastestrecords vullen en door management laten aftekenen.
6. De gebouwde AI-ondersteunde modelgroepwachtrij met echte onderdeelnummer-, foto- en pastestbewijzen vullen en daarna centraal synchroniseren.
7. Leveranciersbestellingen, laptopdatabase en eventuele ERP/Magento-koppelingen aansluiten.
8. Centrale back-up, herstel, monitoring, logging, privacy- en productieacceptatie afronden.

De applicatie bevat nu de volledige, checksum-gebonden Excelmomentopname: 148 unieke hangmaplocaties, 3.218 vellen, 139 veilig operationele regels en 9 geblokkeerde regels met ontbrekende of dubbele artikelnummers. Alle gekoppelde modellen zijn doorzoekbaar, conflicterende SKU-koppelingen worden automatisch in een managementwachtrij gezet en de volledige catalogus kan veilig als CSV worden geëxporteerd. De bronkoppelingen zijn nadrukkelijk nog geen fysieke compatibiliteitsgoedkeuring.

De huidige 3% voor database/back-up betreft de geteste, versiegebonden pilotpersistentie, het gevalideerde JSON-herstel en het databaseschema voor hangmaplocaties, fysieke tellingen, controle-uitkomsten, keyboardreferenties, modelgroepbeoordelingen en compatibiliteitsbewijzen. De telflow en bewijsflow hebben idempotente centrale API's, maar zijn nog niet op een beheerde database uitgevoerd. De 6% voor koppelingen/acceptatie betreft de vervangbare orderlookup-adapter, de complete scan-naar-adviesflow, de op werkvloerinformatie aangepaste hangmapcontrole, een desktop- en mobiel geteste Scandinavische/NL-US-herkenningsflow, de Dell Latitude-stijl E1/E2-pasvormgids, de herleidbare modelgroepwachtrij en de werknemersblokkade na een afgewezen fysieke pastest. Centrale teamsynchronisatie, de werkelijke orderkoppeling, echte onderdeelnummer-/fotobewijzen en fysieke acceptatietests zijn nog niet gereed.

Het percentage wordt alleen verhoogd nadat een onderdeel is geïmplementeerd, getest, naar GitHub gepusht en in de private live-omgeving gepubliceerd.
