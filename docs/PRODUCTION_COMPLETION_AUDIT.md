# KeyFlow productie-completion-audit

Deze matrix toetst de actuele applicatie aan de oorspronkelijke projectprompt en de later aangeleverde werkvloerregels. “Gereed” betekent dat er directe code-, test- en runtime-evidence bestaat. “Voorbereid” betekent dat de applicatielaag aanwezig is, maar een externe aansluiting of formeel acceptatiebewijs ontbreekt.

| Requirement | Status | Actuele evidence | Nog nodig |
|---|---|---|---|
| Volledige Excelvoorraad | Gereed als gecontroleerde applicatiebron | 148 unieke hangmappen, 3.218 vellen en vastgelegde SHA-256; regressietests controleren aantallen en locaties | Fysieke begintelling en formele vrijgave |
| Onveilige Excelregels blokkeren | Gereed | 139 operationele regels; 9 regels met ontbrekende of dubbele SKU zijn niet boekbaar | Managementbesluit voor de 9 bronregels |
| Modelnummer kort invoeren | Gereed | `5420` resolveert naar Dell Latitude 5420; browseraudit dekt order 1859 | Werkelijke orderbron aansluiten |
| Gekoppelde modellen gebruiken | Gereed voor bronkoppelingen | Alle bruikbare modellen uit Excel zijn doorzoekbaar; 7420 verwijst naar hangmap 75 | Fysieke compatibiliteit per combinatie goedkeuren |
| Conflicterende model/SKU-koppelingen | Gereed als veilige wachtrij | Management ziet ieder model dat voor dezelfde layout naar meerdere SKU's verwijst | E1/E2-, onderdeelnummer-, foto- en pastestbewijs |
| Vier conversiemethoden en instelbare €300-grens | Gereed | Beleidsengine, fallbackregels, managementconfiguratie en unit tests | Werkvloeracceptatie bij werkdrukvarianten |
| Oude Noviply: locatie tonen en automatisch −1 | Gereed in pilotopslag | Order 1859 toont SKU NB10172E1NL, E1 en hangmap 75; afboeken volgt pas na controle | Centrale database en gelijktijdigheidstest |
| Verkeerd vel of verkeerde pasvorm | Gereed in pilotopslag | Stoppen zonder afboeken of afzonderlijk uitval boeken; managementanalyse bewaart oorzaak | Fysieke foutscenario's accepteren |
| Nieuwe vellen inboeken | Gereed in pilotopslag | Werknemersontvangst met SKU, aantal en pakbonreferentie | Centrale database en echte pakbonnen |
| Fysieke telling per hangmap | Voorbereid en browsergetest | Blinde invoer, verplichte verschilreden, locatiegebonden voorraad, audit van kloppende tellingen en idempotente centrale API/migratie | Centrale database uitvoeren, ondertekende begintelling en gelijktijdigheidstest met twee apparaten |
| Management ABC/hardlopers/zachtlopers | Gereed op geregistreerde pilottransacties | ABC-engine, configureerbare grenzen, transactielog en tests | Genoeg echte historie voor operationele classificatie |
| Forecasting en besteladvies | Voorbereid | Geteste ROP-, safety-stock- en dekkingberekening; 25 expliciete voorbeeldparameterregels | Echte levertijd, kostprijs, open orders en verbruikshistorie |
| CSV-export | Gereed | Alle 148 regels met locatie, actuele voorraad, modelkoppelingen en datakwaliteit; formule-injectie wordt geneutraliseerd | Gebruikersacceptatie van kolommen |
| PostgreSQL-transacties | Uitvoerbaar voorbereid | Schema en migraties 0001–0013, rij- en idempotentielocks, autorisatie, checksum-preflight, transactionele beginimport en verificatie achteraf | Beheerde `DATABASE_URL`, migraties uitvoeren, fysieke begintelling, back-up en hersteltest |
| Persoonlijke werknemer/managementlogin | Technisch voorbereid | Tenantgebonden Entra/OIDC, app-rollen, achtuurs sessies, gebruikerssynchronisatie, gedeactiveerde-accountblokkade en beveiligde API-actor | Echte Entra-appregistratie, roltoewijzingen, MFA/Conditional Access en acceptatietest |
| Werkelijke order/ERP-koppeling | Voorbereid | Vervangbare lookupadapter en fout-/holdflow | API, authenticatie, veldmapping en testorders |
| Dell E1/E2- en layoutreferenties | Trainingslaag gereed | Nieuwe E1-afbeelding met brede horizontale Enter en E2-afbeelding met hoge L-vormige Enter, actuele-variantmarkering, Nordic-keuzes en NL/US-vergelijking | Goedgekeurde model/SKU-foto's en fysieke pastesten |
| AI-ondersteunde modelgroepen | Wachtrij gereed | Herleidbare voorstellen, bronconflicten, score, verplichte E1/E2-/onderdeelnummer-/foto-/pastestcontrole, lokale audit en geautoriseerde idempotente PostgreSQL-API | Echte bewijsvelden verzamelen, migratie 0011 uitvoeren en eventuele externe AI-bronnen aansluiten |
| Fysieke compatibiliteitsbibliotheek | Flow gereed | Per exact model/SKU: onderdeelnummer, afmetingen, foto, vijf controlepunten, goedkeuring/afwijzing, lokale audit en centrale API; laatste afwijzing blokkeert werknemersadvies | Echte pastesten uitvoeren, foto's opslaan, migratie 0012 uitvoeren en management laten aftekenen |
| Private live-uitrol en GitHub | Gereed per gepubliceerde versie | Private Sites-productie-URL en private GitHub-branch/PR | Nieuwe versie na iedere wijziging blijven publiceren |
| Werkvloeracceptatie | Niet gereed | Desktop- en mobiel browserpad getest | Echte scanners, tablet, hangmappenwagen, medewerkers en timingmeting |

## Conclusie

De aantoonbare voortgang is 92%. De zelfstandig bouwbare broncatalogus, werknemerslogica, managementanalyse, modelkoppelingen, veiligheidsblokkades, persoonlijke-loginbasis en veilige productiebootstrap zijn aanwezig. De resterende 8% bestaat hoofdzakelijk uit beheerde centrale infrastructuur, back-up/herstel, echte Entra-configuratie, de werkelijke orderbron, formeel compatibiliteitsbewijs en fysieke werkvloeracceptatie. Deze onderdelen mogen niet met demo-informatie als “gereed” worden gemarkeerd.
