# KeyFlow productieroadmap

De voortgang wordt gemeten richting een volledige productieversie, niet alleen richting een visueel prototype.

## Huidige voortgang: 86%

| Onderdeel | Gewicht | Gereed |
|---|---:|---:|
| Onderzoek, functioneel ontwerp en UX-basis | 10% | 10% |
| Applicatiebasis, CI, private hosting en securitycontroles | 10% | 10% |
| Excel-import, staging, correcties en audit | 15% | 13% |
| Voorraadcatalogus, transactieregels en scannerworkflow | 15% | 15% |
| Vier conversiemethoden en werknemersuitvoering | 10% | 10% |
| Forecasting, besteladvies en managementrapportages | 10% | 9% |
| Rollen, permissies en gebruikerservaring per rol | 10% | 10% |
| Live PostgreSQL, back-up, herstel en monitoring | 8% | 3% |
| Persoonlijke authenticatie/SSO en sessiebeveiliging | 5% | 0% |
| Externe koppelingen en productieacceptatie | 7% | 6% |
| **Totaal** | **100%** | **86%** |

## Eerstvolgende fasen

1. De lokale pilotpersistentie vervangen door gedeelde PostgreSQL-opslag en de goedgekeurde Excel-import uitvoeren.
2. Persoonlijke login koppelen aan management- en werknemersrollen.
3. De orderlookup-adapter op het werkelijke order- of ERP-systeem aansluiten.
4. De scanner-first invoer, hangmapnummers en vijfpuntscontrole met de werkelijke scanners, hangmappenwagen en tablets op de werkvloer accepteren.
5. E1/E2, onderdeelnummer, afmetingen, foto's en fysieke pastesten als goedgekeurd compatibiliteitsbewijs in de nieuwe referentiebibliotheek verzamelen.
6. AI-ondersteunde modelgroepvoorstellen bouwen met verplichte menselijke goedkeuring.
7. Leveranciersbestellingen, laptopdatabase en eventuele ERP/Magento-koppelingen aansluiten.
8. Centrale back-up, herstel, monitoring, logging, privacy- en productieacceptatie afronden.

De huidige 3% voor database/back-up betreft de geteste, versiegebonden pilotpersistentie, het gevalideerde JSON-herstel en het databaseschema voor hangmaplocaties, controle-uitkomsten en goedkeuringsstatus van keyboardreferenties. De 6% voor koppelingen/acceptatie betreft de vervangbare orderlookup-adapter, de complete scan-naar-adviesflow, de op werkvloerinformatie aangepaste hangmapcontrole, een desktop- en mobiel geteste Scandinavische/NL-US-herkenningsflow en de Dell Latitude-stijl E1/E2-pasvormgids. Centrale teamsynchronisatie, de werkelijke orderkoppeling, goedgekeurde model-/variantfoto's en fysieke acceptatietests zijn nog niet gereed.

Het percentage wordt alleen verhoogd nadat een onderdeel is geïmplementeerd, getest, naar GitHub gepusht en in de private live-omgeving gepubliceerd.
