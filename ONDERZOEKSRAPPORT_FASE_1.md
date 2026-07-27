# Onderzoeksrapport fase 1 — Keyboard Sticker Sheet Inventory Management

**Status:** herziene conceptversie ter goedkeuring  
**Datum:** 27 juli 2026  
**Scope:** analyse, functioneel ontwerp en technisch advies; conform opdracht bevat dit rapport geen applicatiecode.

## 1. Managementsamenvatting

De huidige Excel-oplossing is in essentie een handmatig bijgehouden voorraadlijst met een zoek- en invoerscherm erbovenop. Het bestand bevat 148 voorraadregels en 3.218 geregistreerde stickervellen. Het helpt medewerkers al met zoeken op model en taal en bevat een bruikbaar begin van modelcompatibiliteit. Het is echter geen betrouwbaar voorraadbeheersysteem: er is geen transactielog, geen herleidbare historie, geen gebruiker of tijdstip per mutatie, geen formele magazijnlocatie, geen leverancier of levertijd, geen open bestelling en geen eenduidige scheiding tussen stickervel, laptopmodel en fysieke voorraad.

De grootste risico’s zijn:

1. Voorraad wordt als direct wijzigbaar getal opgeslagen. Wie een aantal overschrijft, wist de geschiedenis.
2. Eén stickervel kan meerdere laptopmodellen bedienen, maar die relatie staat als vrije tekst in één cel. Daardoor kan het systeem niet betrouwbaar tellen, valideren of automatisch vergelijken.
3. Artikelnummers en modellen komen dubbel voor. Daarmee is onduidelijk of aantallen moeten worden opgeteld of dat verschillende stickervarianten worden bedoeld.
4. Het “input”-werkblad bevat een kapotte zoekformule met `#REF!` en een niet-standaard dummyfunctie. De zoekuitvoer is in de aangeleverde kopie leeg.
5. Forecasting is nu onmogelijk te valideren: alleen de actuele stand is beschikbaar; verbruik en leveringen door de tijd ontbreken.

Het advies is een responsieve webapp/PWA met een relationele database, een append-only voorraadtransactielog en een eenvoudige scan-first interface. De voorraadstand wordt berekend uit transacties of veilig als gecontroleerde balans bijgehouden, maar nooit zonder bijbehorend logboek aangepast. De kern van het datamodel is:

**één sticker-SKU/layoutvariant → veel compatibele laptopmodellen**, via een expliciete koppeltabel met status, bron en geldigheidsperiode.

Na aanvullende procesinformatie is de scope breder dan “stickervellenvoorraad”. ReMarkt gebruikt vier keyboard-conversiemethoden met verschillende kosten, kwaliteit, risico’s en toepassingsregels. De oplossing moet daarom uitgroeien tot **Keyboard Conversion Management**: per laptop adviseren welke methode geschikt is, materiaal en machinecapaciteit bewaken, de uitgevoerde methode registreren en kwaliteit/herwerk meten. De grens van €300 is een configureerbare bedrijfsregel en geen hardgecodeerde waarheid, omdat drukte, layoutbeschikbaarheid en uitzonderingen de keuze kunnen veranderen.

Start niet met AI. Start met betrouwbare registratie, snel afboeken, ontvangen, zoeken, compatibiliteit en waarschuwingen. Na minimaal 3–6 maanden schone transactiehistorie kan een eenvoudige forecast worden geëvalueerd; na 6–12 maanden kan per SKU worden gekozen tussen een moving average, SBA/Croston of TSB voor intermitterende vraag. Voor de eerste maanden is de combinatie van laptopvoorraad, open werkvoorraad, leverancier-levertijd, safety stock en handmatig ingestelde min/max betrouwbaarder dan een statistisch model zonder historie.

### 1.1 Vier conversiemethoden

| # | Methode | Huidige toepassing | Sterkte | Belangrijkste nadeel/risico |
|---|---|---|---|---|
| 1 | Goedkope losse stickers | Uitfaseren; alleen uitzonderlijk | Laagste materiaalkosten | Iedere toets één voor één; arbeidsintensief en minder professioneel |
| 2 | Noviply oude variant / voorraadvel | De voorraad uit het huidige Excel; doorgaans laptops onder €300, vooral QWERTY US, momenteel laatste optie | Volledig vel in één keer positioneren en drager verwijderen; snel | Oude variant, voorraad- en modelafhankelijk; beleidsgrens wisselt met drukte |
| 3 | Direct geprinte, sterkere Noviply-sticker | Momenteel buitenlandse orders/layouts buiten QWERTY US en onder €300 | Sterker en visueel beter dan de oude variant | “First-time-right” is kritisch; fout aanbrengen veroorzaakt veel problemen/herwerk |
| 4 | Directe keyboard reprint | Momenteel standaard boven €300; ook fallback als juiste layout ontbreekt | Hoogwaardig uiterlijk, duurzame/professionele conversie | Machine-, ontwerp-, operator- en procescapaciteit; verbruiksartikelen en kwaliteitscontrole nodig |

Deze indeling is gebaseerd op de door ReMarkt beschreven praktijk. Publieke leveranciersinformatie ondersteunt onderdelen ervan, maar niet iedere interne productvariant of beslisregel is publiek gedocumenteerd. Met name “Noviply oude variant” versus “direct geprinte sterkere Noviply-sticker” moet tijdens masterdata-inrichting samen met productcodes, printertype en leverancier worden bevestigd.

### 1.2 Voorlopige beslislogica

De applicatie moet adviseren, maar de medewerker moet binnen bevoegdheden gemotiveerd kunnen afwijken.

1. Bepaal gewenste klantlayout en controleer huidige keyboard-layout.
2. Als geen conversie nodig is: registreer `geen conversie`.
3. Controleer technische geschiktheid per methode, waaronder model, backlight, keyboardmateriaal, beschikbare template en fysieke compatibiliteit.
4. Bij verkoopwaarde vanaf de configureerbare grens (initieel €300): adviseer directe keyboard reprint.
5. Onder de grens:
   - voor niet-QWERTY-US/buitenlandse layout: adviseer de sterkere direct geprinte sticker indien beschikbaar en geschikt;
   - voor QWERTY US: adviseer volgens de actuele operationele voorkeursvolgorde; de oude Noviply-voorraad is momenteel een laatste optie;
   - goedkope losse stickers alleen als expliciet toegestane noodfallback.
6. Als de voorkeursmethode niet beschikbaar is, toon geordende alternatieven met reden, meerkosten, risico en verwachte doorlooptijd.
7. Drukte/capaciteit mag het advies beïnvloeden via een tijdelijke, gedateerde beleidsregel; leg altijd vast waarom van het normale beleid is afgeweken.

De €300-regel moet kunnen werken met inclusieve/exclusieve btw en een duidelijk waardetype, bijvoorbeeld verwachte netto verkoopwaarde op het moment van productie. Zonder deze definitie kunnen identieke laptops verschillend worden behandeld.

### 1.3 Aanvullend leveranciersonderzoek

Noviply positioneert haar keyboardstickers als circa 50 µ dun, model- en taalspecifiek, slijtvast en in ongeveer 30–60 seconden aan te brengen. De leverancier noemt precisie per model, Europese taalvarianten en het in één proces aanbrengen met een drager. Dit ondersteunt methode 2 en mogelijk delen van methode 3, maar de exacte oude en geprinte ReMarkt-varianten moeten aan eigen SKU’s en productieprocessen worden gekoppeld.

Keyboard Print biedt een “Remote Keyboard Print Service” voor in-house reprinting. Volgens de leverancier:

- kan de machine twee keyboards per printcyclus bevatten;
- duurt een print ongeveer vier minuten per keyboard;
- zijn houders beschikbaar voor keyboards, laptops, 2-in-1-modellen en Surface-type keyboards;
- krijgt de klant toegang tot een layout-/designdatabase en ontwerpen voor nieuwe modellen;
- zijn primer, inkt, wiping fluid en inkchips verbruiksartikelen;
- horen training, onderhoud, online support en machine-swapservice bij het aanbod;
- kunnen normale en backlit keyboards worden verwerkt.

Keyboard Print beschrijft bij de uitgebreidere digitale reprint een proces van voorbereiding, verwijderen/conditioneren van de oorspronkelijke toplaag, layoutplanning, precisieprint en kwaliteitscontrole. De leverancier vermeldt één jaar garantie op het geprinte oppervlak. De intern genoemde blue-lightstap is niet expliciet bevestigd op de geraadpleegde openbare pagina’s en wordt daarom een technisch validatiepunt.

## 2. Onderzoeksmethode en beperkingen

Het volledige aangeleverde `.xlsx`-bestand is technisch en inhoudelijk uitgelezen: werkbladen, gebruikte bereiken, waarden, formules, validaties, opmerkingen, voorwaardelijke opmaak, duplicaten en lege/afwijkende velden. Daarnaast zijn actuele primaire of gezaghebbende bronnen geraadpleegd van Microsoft, Oracle, Apple, GS1 en Nielsen Norman Group, aangevuld met wetenschappelijke literatuur over intermitterende vraag.

Beperkingen:

- Er zijn geen gebruikersinterviews of observaties op de stickerafdeling uitgevoerd.
- Het bestand bevat geen mutatiehistorie; historisch verbruik kan dus niet achteraf worden gereconstrueerd.
- De betekenis van “Productie” versus “Voorraad” is uit inhoud en opmerkingen afgeleid en moet in een workshop worden bevestigd.
- Financiële gegevens, leveranciersafspraken, werkelijke levertijden, locaties en laptopvoorraad zijn niet meegeleverd.
- Sommige gekoppelde modellen kunnen inhoudelijk onjuist zijn. Dit rapport beoordeelt de datastructuur, niet de fysieke pasvorm van ieder stickervel.

## 3. Analyse van het huidige Excel-bestand

### 3.1 Overzicht

| Werkblad | Functie | Werkelijk gevulde inhoud | Belangrijkste observatie |
|---|---|---:|---|
| `Productie` | Hoofdvoorraad | rijen 1–150; 148 gegevensregels | Feitelijke masterlijst en voorraadstand |
| `Voorraad ` | Voorraad op kantoor | rijen 1–7; 6 gegevensregels | Tweede voorraadlijst, deels met benaderde aantallen |
| `input` | Zoeken, muteren en lage voorraad | rijen 1–61 | Handmatig bedieningsscherm; zoekformule is defect |

De werkbladen zijn technisch tot circa 1.000 rijen/veel kolommen geformatteerd, maar grotendeels leeg. Er zijn geen Excel-tabellen, draaitabellen, grafieken of werkbladbeveiliging. Vrijwel alle gevulde cellen zijn wijzigbaar.

### 3.2 Werkblad `Productie`

Kolommen:

- `nr.`: handmatig volgnummer, uniek in de huidige lijst.
- `Laptop`: representatief laptopmodel.
- `Quantity`: actuele voorraad zoals handmatig bijgehouden.
- `Taal`: `QWERTY US`, `AZERTY FR` of `QWERTZ DE`.
- `Articel nr.`: intern artikelnummer; spelling en invoer zijn niet afgedwongen.
- `Bijbehorende modelen`: vrije, kommagescheiden tekst met compatibele laptopmodellen.
- `Opmerkingen`: pasvorm-, kleur- of labelafwijkingen en controlepunten.

Kwantitatieve momentopname:

- 148 regels.
- 3.218 stuks geregistreerde voorraad.
- 145 QWERTY US-regels, 2 AZERTY FR-regels en 1 QWERTZ DE-regel.
- Voorraadbereik 0–201.
- 15 regels hebben een voorraad van 10 of lager.
- 3 regels hebben een voorraad van 5 of lager:
  - Fujitsu Lifebook U7410: 0;
  - HP 240 G8: 2;
  - HP ZBook 15 G3, QWERTZ DE: 4.
- 14 regels bevatten een zichtbare opmerking.
- 21 regels hebben geen gekoppelde modellen.
- Nog eens 9 regels hebben een placeholder of onbruikbare waarde zoals `Geen gevonden`, `-`, `\`, `0` of `A`.
- 3 artikelnummers ontbreken of hebben een ongeldig formaat:
  - Dell Latitude 5401: `,,,,,,,,,,`;
  - Dell Precision 7540: alleen een spatie;
  - Fujitsu Lifebook U7410: leeg.

Dubbele artikelnummers:

| Artikelnummer | Regels | Opgetelde voorraad | Risico |
|---|---|---:|---|
| NB10100E1NL | Microsoft Surface Pro 7 tweemaal | 38 | Waarschijnlijk dubbel record |
| NB10021E1NL | Surface Laptop 3 en “Mircorsoft Surface Laptop 2” | 56 | Mogelijk één SKU voor twee modellen, verkeerd gemodelleerd |
| NB10190E1NL | Dell Precision 3560 en Dell Precision 5560 | 41 | Verdacht: mogelijk fout artikelnummer of gedeelde SKU |

Ook modelnamen komen na eenvoudige normalisatie dubbel voor: Dell Latitude 5420, HP ProBook 430 G5, Microsoft Surface Pro 7, HP ZBook 15 G3, Fujitsu Lifebook U7310 en Fujitsu Lifebook U7410. Hoofdletters, spaties en typefouten veroorzaken extra schijnvarianten, bijvoorbeeld `Mircorsoft`, `Eelitebook`, `stikker`, `Articel` en `modelen`.

Belangrijke inhoudelijke signalen uit opmerkingen:

- Een label op het vel kan een andere taal noemen dan het vel feitelijk bevat.
- Pasvorm kan “beetje klein” zijn of gaten/uitsparingen missen.
- Kleur of toetsuitlijning kan afwijken.
- Sommige compatibiliteit is door AI toegevoegd of moet nog worden nagekeken.

Deze informatie is waardevol, maar hoort niet uitsluitend in vrije notities. Maak er waar mogelijk gestructureerde kwaliteits- en compatibiliteitsvelden van.

### 3.3 Werkblad `Voorraad `

Dit blad bevat 6 regels met vermoedelijk stickervellen die op kantoor liggen. Een threaded comment vermeldt: “hier kunnen alle sticker vellen die op het kantoor liggen”.

Zwakke punten:

- Voorraad staat deels als tekst (`~200`) en deels als getal.
- Dezelfde artikelen lijken ook in `Productie` voor te komen, maar er is geen formele magazijnlocatie of transferregistratie.
- “Bijbehorende modellen” en aantallen per model zijn opnieuw vrije tekst.
- Er is geen garantie dat de totaalvoorraad de som van kantoor en productie is, of dat `Productie` juist al de totale voorraad bevat.

Interpretatie die moet worden bevestigd: dit is waarschijnlijk een aparte fysieke locatie. In het nieuwe systeem moet “kantoor” een voorraadlocatie worden. Verplaatsingen tussen kantoor en stickerafdeling zijn dan transacties, geen tweede losstaande lijst.

### 3.4 Werkblad `input`

Aanwezige conceptfuncties:

- voorraad bijwerken via stickernummer en aantal;
- zoeken op laptop, nummer of taal;
- taalfilter;
- lijst met lage voorraad;
- werkinstructie om bakken iedere vrijdag te controleren;
- instructie om Wout te informeren bij minder dan 5 stuks.

Technische bevindingen:

- De enige zoekformule bevat `#REF!`-verwijzingen en `__xludf.DUMMYFUNCTION`.
- De gecachte waarde van de zoekuitvoer is leeg.
- De lage-voorraadlijst is een handmatig/statisch ogende momentopname en bevat doublures en tegenstrijdige aantallen.
- Er is slechts beperkte gegevensvalidatie.
- Er zijn geen blokkades tegen negatieve voorraad, dubbele artikelen of onbedoeld overschrijven.
- Er is geen audittrail van het “Update Sticker Stock”-proces.

Wat goed werkt aan het concept:

- De gebruiker hoeft niet altijd direct in de hoofddata te werken.
- Zoeken op representatief of gekoppeld model is de juiste gebruikersbehoefte.
- Een taalfilter en een lage-voorraadweergave zijn relevante functies.
- De werkinstructies laten zien dat er al een operationele routine en escalatiedrempel bestaat.

### 3.5 Huidige werkwijze

De vermoedelijke huidige flow:

1. Laptop wordt getest en van software voorzien.
2. Stickerafdeling controleert de keyboard-layout.
3. Indien nodig zoekt de medewerker in Excel naar laptop/model of stickervel.
4. De medewerker neemt fysiek een vel.
5. Het getal in Excel wordt handmatig verlaagd, direct of via het invoerblad.
6. Eén keer per week worden bakken gecontroleerd.
7. Bij minder dan 5 stuks wordt Wout handmatig geïnformeerd.
8. Leveringen en kantoorvoorraad worden handmatig toegevoegd of in een tweede blad gezet.

De flow kent geen geforceerde identificatie van gebruiker, locatie, reden of laptop/workorder. Daardoor is een verschil tussen systeem en bak achteraf niet verklaarbaar.

### 3.6 Belangrijke, overbodige en ontbrekende gegevens

**Behouden en structureren**

- intern artikelnummer/SKU;
- taal/layout;
- actuele aantallen per fysieke locatie;
- representatief model;
- compatibele modellen;
- opmerkingen over pasvorm, kleur en label;
- laag-voorraadsignaal.

**Niet als zelfstandig bedrijfsgegeven behouden**

- handmatig volgnummer als primaire identiteit;
- dubbele modelnamen in meerdere tekstvelden;
- statische lage-voorraadkopieën;
- benaderde teksthoeveelheden zoals `~200`;
- lege, “geen gevonden”- of symboolwaarden als compatibiliteitsdata.

**Ontbreekt**

- stabiele unieke ID’s;
- SKU-variant en fysieke layoutidentiteit;
- fabrikant, productfamilie, model en generatie als aparte velden;
- voorraadlocatie en eventueel baknummer;
- eenheid en verpakkingseenheid;
- transactietype, hoeveelheid, datum/tijd, gebruiker en reden;
- referentie naar laptop, batch, werkorder of productieorder;
- leverancier, leveranciersartikelnummer, prijs, MOQ, bestelveelvoud en levertijd;
- open inkooporders en verwachte ontvangst;
- gereserveerde voorraad;
- minimum, maximum, safety stock, servicelevel en reorder point;
- status van compatibiliteit: concept, fysiek getest, afgekeurd;
- bron en bewijs van compatibiliteit;
- kwaliteitsstatus/blokkade van een SKU;
- barcode/QR-code;
- voorraadwaarde;
- wijzigingslog en rollen/rechten;
- laptopvoorraad en geplande refurbish-vraag.

## 4. Industrieonderzoek en toepasbare best practices

Professionele WMS-, ERP- en MRO-oplossingen scheiden stamdata, voorraadbalans, transacties, locaties, planning en inkoop. De toepasbare principes zijn:

1. **Item-location als planningsniveau.** Voorraad en bestelparameters verschillen per SKU en locatie.
2. **Transactiegestuurd.** Ontvangst, verbruik, transfer, correctie, telling en retour zijn afzonderlijke gebeurtenissen.
3. **Min/max en reorder point.** Microsoft beschrijft min/max-aanvulling per artikel en locatie. Oracle definieert het reorder point als safety stock plus verwachte vraag tijdens de levertijd.
4. **Beschikbare voorraad, niet alleen on-hand.** Planning gebruikt: on-hand + bevestigde inkomende voorraad − reserveringen/verwachte vraag.
5. **Cycle counting.** Frequente deeltellingen vervangen of ondersteunen een zeldzame volledige telling; tellingen kunnen op drempel of risico worden gestart.
6. **Mobiele/scannerflow.** Professionele warehouse-apps vullen bekende waarden vooraf in, slaan irrelevante stappen over en ondersteunen camera- én hardware-scanners.
7. **Segmentatie.** ABC classificeert op economische impact; XYZ op voorspelbaarheid/variatie. Voor dit project is daarnaast criticality belangrijk: een goedkoop vel kan een dure laptopflow blokkeren.
8. **Traceerbaarheid.** Elke mutatie heeft actor, tijd, reden, bron en resultaat.
9. **Exception management.** Gebruikers werken vooral vanuit uitzonderingen: tekort, lage dekking, tellingverschil, ontbrekende compatibiliteit, vertraagde order.
10. **Integratie via API en events.** Geen directe databasekoppelingen met Magento/ERP/laptopdatabase; gebruik versieerbare API-contracten en idempotente imports.

Kanban kan fysiek nuttig blijven: een tweebaksysteem of rood kaartje geeft een visuele fallback. De digitale applicatie moet echter de bron van waarheid worden. Een baklabel bevat SKU, taal, locatie en barcode/QR; de tweede bak of het minimum markeert het bestelpunt.

## 5. UX-onderzoek en ontwerpprincipes

### 5.1 Doelgroepen

- **Stickeroperator:** razendsnel juiste vel vinden en één of meer stuks afboeken.
- **Voorraadbeheerder:** ontvangen, tellen, corrigeren, compatibiliteit onderhouden.
- **Inkoper/planner:** tekorten, dekking, besteladvies, leveranciers en orders.
- **Teamleider/manager:** trends, betrouwbaarheid, uitzonderingen en KPI’s.
- **Beheerder:** gebruikers, rollen, import, configuratie en audit.

### 5.2 Kernprincipes

Gebaseerd op Nielsen: toon systeemstatus, voorkom fouten, gebruik herkenning in plaats van herinnering, bied undo/correctie, hanteer consistente termen en toon alleen relevante informatie. Microsoft en Apple adviseren ruime touchdoelen; voor deze app is minimaal circa 44×44 CSS-pixels met zichtbare tussenruimte een praktische ondergrens.

Ontwerpregels:

- Scanner of zoekveld krijgt automatisch focus.
- Zoek op SKU, barcode, fabrikant, exact model, alias, typefouttolerante naam en gekoppeld model.
- Toon vóór bevestiging: foto/visuele identificatie, taal, SKU, locatie, voorraad en compatibiliteitsstatus.
- Standaardactie is “−1”, één prominente knop of één scan; afwijkend aantal vraagt expliciete invoer.
- Na actie: groot groen resultaat, nieuwe voorraad, geluid/haptiek waar beschikbaar en 10–30 seconden “ongedaan maken”.
- Negatieve voorraad is standaard verboden; alleen een bevoegde correctie met reden mag een verschil oplossen.
- Risicovolle bulk- of correctieacties vragen reden en een samenvatting, niet op elke normale `−1`.
- Sneltoetsen voor experts, bijvoorbeeld `/` zoeken, `-` afboeken, `+` ontvangen, `Enter` bevestigen, maar alle functies blijven zichtbaar en touchbaar.
- Desktop, 10-inch tablet en handheld/scanner krijgen responsieve taakgerichte layouts.
- Kleur is nooit het enige signaal; gebruik tekst, icoon en status.
- Offline kan later met een beperkte wachtrij, unieke mutatie-ID’s en expliciete synchronisatiestatus. Geen stille “last write wins”.

### 5.3 Voorgestelde hoofdschermen

1. **Vandaag / operationeel startscherm**
   - scannen of zoeken;
   - snelle afboeking;
   - ontvangen;
   - open tellingen;
   - urgente tekorten.
2. **Zoekresultaat**
   - beste exacte match bovenaan;
   - compatibele SKU’s met status “getest” of “onbevestigd”;
   - voorraad per locatie en afstand/bak.
3. **SKU-detail**
   - voorraad, dekking, foto, taal, compatibele modellen;
   - recente transacties;
   - open bestelling en besteladvies;
   - kwaliteitswaarschuwing.
4. **Ontvangst**
   - scan order/SKU;
   - aantal en locatie;
   - afwijking/beschadiging;
   - bevestigen en label printen.
5. **Tellen**
   - scan locatie en SKU;
   - blind count waar gewenst;
   - verschil en hertelling;
   - correctie pas na autorisatie.
6. **Planning**
   - uitzonderingen gerangschikt op stockoutrisico en operationele impact.

Doel voor de meest voorkomende flow: scan model of SKU → controleer match → tik `−1`. Bij een bekende barcode kan afboeken met één scan plus één bevestiging; optioneel kan een “continuous scan”-modus na pilot automatisch `−1` boeken met directe undo.

## 6. Functioneel ontwerp

### 6.1 Must-have bedrijfsprocessen

**Verbruik/afboeken**

- SKU via barcode, model of zoekopdracht vinden.
- Locatie en hoeveelheid vastleggen.
- Reden standaard `refurbish_verbruik`.
- Optioneel laptop-ID/workorder registreren.
- Atomaire voorraadmutatie: transactie en balans slagen samen of geen van beide.
- Drempels direct opnieuw evalueren.

**Ontvangst**

- Ontvangst tegen inkooporder of losse ontvangst met reden.
- Aantal, locatie, leverancier, pakbon en gebruiker registreren.
- Eventueel afwijking/quarantaine.

**Transfer**

- Van kantoor naar stickerafdeling of tussen bakken.
- Eén logisch transferdocument met uit- en inboeking.

**Telling/correctie**

- Periodieke of ad-hoc cycle count.
- Telling is niet hetzelfde als voorraad handmatig overschrijven.
- Verschil leidt na bevestiging tot correctietransactie met reden en autorisatie.

**Compatibiliteit**

- Eén SKU kan veel modellen ondersteunen.
- Eén model kan meerdere SKU’s ondersteunen, bijvoorbeeld verschillende taal, kleur, kwaliteit of alternatieven.
- Koppeling bevat `fit_status`: onbevestigd, fysiek getest, conditioneel, afgekeurd.
- Conditionele match kan uitleg bevatten: “iets klein”, “geen trackpoint-uitsparing”, “label zegt QWERTZ”.
- Alleen bevoegde gebruikers mogen een koppeling als fysiek getest markeren.

**Waarschuwingen**

- onder reorder point;
- verwachte stockout vóór volgende levering;
- laptopvraag groter dan beschikbare stickerdekking;
- nulvoorraad met actuele laptopvraag;
- achterstallige telling;
- open order te laat;
- ontbrekende/ongeverifieerde compatibiliteit;
- ongewoon grote mutatie of tellingverschil.

**Methodeadvies en conversieorder**

- Lees gewenste klantlayout, laptopmodel, verkoopwaarde, orderland/-kanaal en actuele workload.
- Bepaal technisch toegestane methoden en controleer materiaal, template, machine en bevoegde operator.
- Pas de op dat moment geldige beleidsversie toe.
- Toon één voorkeursmethode en maximaal enkele gerangschikte alternatieven.
- Laat een bevoegde medewerker afwijken met een gestandaardiseerde reden, bijvoorbeeld capaciteit, layout niet beschikbaar, kwaliteitsrisico of spoed.
- Reserveer sticker of printertijd/verbruiksmateriaal bij vrijgave van de conversieorder.
- Registreer start, gereedmelding, kwaliteitscontrole, herwerk, materiaalverlies en doorlooptijd.
- Laat de regelmotor nooit uitsluitend op orderland beslissen: gewenste layout is leidend; land/markt is ondersteunend.

**Directe keyboard reprint**

- Controleer of model-layouttemplate is goedgekeurd.
- Plan machine, houder en bevoegde operator.
- Controleer minimumvoorraad van primer, inkt, reinigingsvloeistof en overige consumables.
- Registreer pre-cleaning/voorbereiding, print, eventuele intern gebruikte blue-light/uithardingsstap en kwaliteitsvrijgave.
- Blokkeer aflevering bij mislukte of ontbrekende kwaliteitscontrole.
- Meet first-pass yield, herprintpercentage, cyclustijd en uitval.

**Sterkere direct geprinte sticker**

- Behandel het geprinte vel als een geproduceerd item met grondstofverbruik en batch/printtijd.
- Leg vast welke printer, templateversie en operator het vel produceerde.
- Scan het geproduceerde vel vóór toepassing naar de juiste laptop/conversieorder.
- Gebruik een expliciete “dry alignment”/visuele controle vóór definitief aanbrengen, omdat verkeerd positioneren volgens de praktijk moeilijk herstelbaar is.
- Registreer mislukte applicaties als scrap/herwerk, niet als onverklaarde voorraadcorrectie.

### 6.2 Laptopmodel normalisatie

Maak fabrikant, familie en modelnaam afzonderlijk. Voorbeeld:

- fabrikant: HP;
- familie: EliteBook;
- model: 840 G8;
- genormaliseerde weergave: HP EliteBook 840 G8.

Aliases ondersteunen typefouten en alternatieve schrijfwijzen, maar verwijzen naar één canoniek model. Een modelgroep is nuttig voor beheer en navigatie, maar compatibiliteit moet uiteindelijk expliciet tussen SKU en model worden vastgelegd. Anders kan een te brede groep onterecht pasvorm erven.

Voorgestelde validatieflow:

1. Import herkent vermoedelijke bestaande modellen.
2. Mogelijke dubbelen worden als reviewtaak getoond.
3. Gekoppelde vrije tekst wordt naar afzonderlijke modelkandidaten gesplitst.
4. Een beheerder keurt matches goed.
5. Fysieke test kan status naar “getest” verhogen.
6. Wijzigingen zijn gedateerd; oude relaties blijven historisch herleidbaar.

### 6.3 Rollen en rechten

| Rol | Rechten |
|---|---|
| Operator | zoeken, normaal afboeken, eigen recente actie corrigeren/undo |
| Voorraadbeheerder | ontvangen, transfer, tellen, gemotiveerde correctie |
| Planner/inkoper | leveranciers, besteladvies, inkooporders |
| Databeheerder | SKU’s, modellen, aliases en compatibiliteit |
| Manager/auditor | dashboards en audit, geen operationele mutaties nodig |
| Systeembeheerder | gebruikers, configuratie, integraties |

Functiescheiding: grote correcties, verwijderen van masterdata en aanpassing van kritieke bestelparameters vereisen verhoogde rechten en worden altijd gelogd.

## 7. Databasevoorstel

### 7.1 Kernentiteiten

| Entiteit | Doel | Belangrijkste velden |
|---|---|---|
| `manufacturers` | Canonieke fabrikant | id, naam |
| `model_families` | Productfamilie | id, manufacturer_id, naam |
| `laptop_models` | Canoniek model | id, family_id, modelnaam, generatie, status |
| `model_aliases` | Zoeknamen/typevarianten | id, model_id, alias, bron |
| `keyboard_layouts` | Logische taal/layout | id, code, taal, geometrie/standaard |
| `sticker_skus` | Bestelbare/fysieke variant | id, sku, layout_id, kleur, uitvoering, status, barcode |
| `sku_model_compatibility` | Many-to-many pasvorm | sku_id, model_id, status, confidence, notitie, bron, getest_op, getest_door |
| `warehouses` | Site/magazijn | id, naam |
| `locations` | Kantoor, afdeling, bak | id, warehouse_id, code, type, actief |
| `inventory_balances` | Snelle actuele balans | sku_id, location_id, on_hand, reserved, version |
| `inventory_transactions` | Onveranderbare mutaties | id, sku_id, location_id, type, quantity_delta, timestamp, user_id, reason, reference_type/id, idempotency_key |
| `stock_counts` / `stock_count_lines` | Tellingen en verschillen | status, locatie, teller, counted_qty, expected_qty |
| `suppliers` | Leveranciers | id, naam, contact, actief |
| `supplier_skus` | Leverancierscondities | supplier_id, sku_id, supplier_code, lead_time_days, MOQ, order_multiple, prijs, valuta |
| `purchase_orders` / `purchase_order_lines` | Bestellingen en ontvangst | status, besteld, ontvangen, verwacht_op |
| `planning_parameters` | Voorraadbeleid per SKU/locatie | min, max, safety_stock, service_level, methode, review_cycle |
| `demand_forecasts` | Versies van voorspellingen | sku_id, location_id, bucket, model, forecast, interval, run_id |
| `laptop_inventory_snapshots` | Externe laptopvraag | model_id, status, quantity, snapshot_at, source |
| `notifications` | Uitzonderingen | type, ernst, status, entity, first/last_seen |
| `users`, `roles`, `user_roles` | Toegang | identiteit en rol |
| `audit_logs` | Masterdata- en configuratiewijziging | actor, tijd, entity, before/after, correlation_id |
| `attachments` | Foto/bewijs/pakbon | object storage key, type, checksum, relatie |
| `conversion_methods` | De vier procesopties | id, code, naam, lifecycle_status, quality_tier, requires_skill |
| `conversion_policies` | Versiebeheerde beslisregels | method_id, value_from/to, target_layout, priority, workload_condition, valid_from/to |
| `conversion_capabilities` | Geschiktheid per model/methode | method_id, model_id, layout_id, template_id, status, beperking, getest_op |
| `conversion_jobs` | Uitvoering per laptop/order | laptop_id, order_id, method_id, operator_id, status, started/completed_at, policy_version, override_reason |
| `conversion_job_materials` | Werkelijk materiaalverbruik | job_id, consumable_sku_id, quantity, transaction_id |
| `equipment` | Printers en hulpmiddelen | id, equipment_type, serienummer, locatie, status, capaciteit |
| `equipment_templates` | Print-/snijontwerpen | equipment_id, model_id, layout_id, version, approval_status |
| `equipment_events` | Gebruik, storing en onderhoud | equipment_id, type, tijd, tellerstand, duur, actor |
| `quality_checks` | First-time-right en vrijgave | job_id, resultaat, defect_type, controleur, foto, checked_at |
| `rework_events` | Herwerk en uitval | job_id, oorzaak, vervolgactie, materiaalverlies, arbeidstijd |

### 7.2 Relaties en ontwerpkeuzes

- `keyboard_layouts` is de semantische layout; `sticker_skus` is de fysieke/commerciële variant. Twee verschillende vellen kunnen dus dezelfde taal/layout hebben maar een andere pasvorm, kleur of leverancier.
- Compatibiliteit is many-to-many. Leg geen lijst met modellen als JSON of kommagescheiden tekst in de SKU-tabel vast.
- Voorraad bestaat per SKU × locatie.
- Een voorraadtransactie heeft één hoeveelheid met teken. Transfers gebruiken twee gekoppelde regels binnen één transactie-eenheid.
- De balans is een afgeleide/prestatiegerichte tabel en moet altijd overeenkomen met de som van transacties vanaf een gecontroleerd openingssaldo.
- Transacties worden niet verwijderd of aangepast; correcties gebeuren met een tegengestelde transactie.
- Forecasts en laptopvoorraad zijn snapshots met bron en tijdstip, zodat dashboards reproduceerbaar blijven.
- Geldbedragen gebruiken vaste decimalen; aantallen zijn gehele getallen zolang geen deelvellen bestaan.
- Elk extern bericht heeft een `idempotency_key` om dubbele boekingen bij retry te voorkomen.
- Een conversiebeleid is versieerbaar. Een latere wijziging van de €300-grens mag oude beslissingen niet achteraf herschrijven.
- Een laptop/conversieorder bewaart zowel het systeemadvies als de werkelijk gekozen methode en eventuele afwijkingsreden.
- Methoden 1–3 verbruiken sticker-SKU’s; methode 4 verbruikt printmedia/inkt/primer en machinecapaciteit. De voorraadmotor blijft hetzelfde, maar de stuklijst per methode verschilt.
- Een methode kan `active`, `fallback_only` of `phasing_out` zijn. Methode 1 hoort initieel de status `phasing_out` of `fallback_only` te krijgen.
- Compatibiliteit en printbaarheid zijn niet identiek. Een model kan geschikt zijn voor een sticker-SKU, voor directe reprint, voor beide of voor geen van beide.

### 7.3 Voorraadberekeningen

- `on_hand = openingssaldo + som(quantity_delta)`
- `available = on_hand − reserved`
- `inventory_position = on_hand + confirmed_on_order − reserved − known_demand`
- `coverage_days = available / forecast_daily_demand`, met expliciete behandeling van nulvraag
- `reorder_point = expected_lead_time_demand + safety_stock`
- besteladvies bij `inventory_position ≤ reorder_point`
- doelaantal bij min/max: `max_level − inventory_position`, afgerond op MOQ/bestelveelvoud

## 8. Forecasting- en voorraadstrategie

### 8.1 Wat nu wel en niet kan

Het huidige Excel-bestand bevat een actuele stand, geen tijdreeks. Een gemiddeld week- of maandverbruik, trend, seizoenspatroon, servicelevel of forecastfout kan dus niet worden berekend. Elk exact “nog vier maanden voorraad”-antwoord op basis van alleen dit bestand zou schijnzekerheid zijn.

Vanaf livegang moet iedere afboeking, ontvangst, correctie en stockout worden geregistreerd. Correcties en transfers mogen niet als vraag worden geteld. Ook gemiste vraag/stockout moet worden vastgelegd, anders onderschat historie de echte behoefte.

### 8.2 Aanbevolen fasering

**Dag 1–90**

- Handmatig gevalideerde min/max per kritieke SKU.
- Vraaggestuurde vergelijking met huidige laptopvoorraad en open refurbish-werkvoorraad.
- Reorder point op basis van leverancier-levertijd, bekende vraag en conservatieve buffer.
- Wekelijkse review van uitzonderingen.

**Na 3–6 maanden**

- Eenvoudige baselines: gemiddelde per week, gewogen moving average en naïeve forecast.
- Per SKU meten: zero-demand percentage, gemiddelde interval tussen afboekingen en variatie.
- Forecast Backtesting met rolling origin; vergelijk bias, MAE/MASE en vooral voorraad-KPI’s zoals fill rate en stockouts.

**Na 6–12 maanden**

- Regelmatige vraag: exponentiële smoothing/ETS of seizoensmodel wanneer data dat ondersteunt.
- Intermitterende vraag: SBA/Croston als benchmark.
- Obsolescentie of afnemende modelvraag: TSB, omdat de vraagkans ook tijdens nulperioden afneemt.
- Externe regressors: laptopvoorraad, ingestroomde batches, refurbishplanning en modelmix.
- Geen complex AI-model zonder aantoonbare verbetering ten opzichte van eenvoudige benchmarks.

Onderzoek naar spare-parts demand bevestigt dat conventionele smoothing tekortschiet bij lange reeksen van nulvraag. Croston splitst vraaggrootte en tussentijd; SBA corrigeert bias. TSB is geschikter wanneer vraag kan uitsterven, omdat het de vraagkans ook in nulperioden bijwerkt.

### 8.3 Safety stock

Gebruik in de MVP een transparante beleidsbuffer:

- kritieke A-items: hogere servicegraad;
- lange/onzekere levertijd: grotere buffer;
- bewezen alternatieve SKU: kleinere buffer mogelijk;
- goedkoop maar productiestoppend item: criticality kan ABC overstijgen.

Met voldoende historie:

`safety stock ≈ z × standaardafwijking van de forecastfout over de levertijd`

Dit vereist betrouwbare forecastfouten en levertijdvariatie. Een vast percentage van gemiddelde vraag is eenvoudiger, maar minder nauwkeurig en moet als tijdelijke regel worden gelabeld.

### 8.4 EOQ

EOQ kan een theoretisch bestelvolume geven uit jaarvraag, bestelkosten en voorraadkosten, maar is hier niet automatisch de beste eerste keuze. Vellen zijn vermoedelijk goedkoop, vraag is intermitterend, ruimte/obsolescentie en leveranciers-MOQ kunnen belangrijker zijn. Gebruik aanvankelijk min/max met MOQ en bestelveelvoud. Voeg EOQ alleen toe wanneer bestel- en holdingkosten betrouwbaar bekend zijn.

### 8.5 ABC–XYZ–criticality

- **ABC:** jaarlijkse verbruikswaarde.
- **XYZ:** vraagstabiliteit/voorspelbaarheid.
- **Criticality:** impact van geen voorraad op refurbish-output.

Aanbevolen planningsegment: bijvoorbeeld `A-X-kritiek` of `C-Z-kritiek`. Cycle-countfrequentie en servicelevel volgen uit de combinatie, niet alleen uit prijs.

## 9. Vergelijking met laptopvoorraad

Dit is een zeer waardevolle uitbreiding en kan eerder waarde leveren dan statistische forecasting.

Benodigde gegevens per laptopsnapshot:

- canoniek model-ID;
- operationele status: aanwezig, ingepland, wacht op test, wacht op sticker, verkocht/gereserveerd;
- hoeveelheid;
- huidige fysieke keyboard-layout indien bekend;
- gewenste verkooplayout/markt;
- verwachte doorloopdatum.

Berekening:

1. Selecteer laptops die waarschijnlijk een sticker nodig hebben.
2. Map ieder model via `sku_model_compatibility` naar toegestane SKU’s.
3. Pas taal, kleur, fysieke variant en goedkeuringsstatus toe.
4. Trek al gereserveerde stickers af.
5. Verdeel vraag niet blind dubbel over alternatieve SKU’s; gebruik een allocatieregel of optimalisatie.
6. Vergelijk netto behoefte met beschikbare voorraad en bevestigde ontvangsten.

Voorbeeldmelding:

> NB10082E1NL: 30 beschikbaar, 420 relevante laptops, 20 onderweg. Netto tekort 370. Eerste verwachte stockout binnen 3 werkdagen.

Toon ook de aannames: welke laptopstatussen zijn meegeteld, welk percentage verwacht een sticker nodig te hebben en welke compatibiliteitskoppelingen zijn onbevestigd. Zo blijft het advies uitlegbaar.

Professionele material-planning gebruikt hiervoor onafhankelijke vraag of een stuklijst. Voor dit proces kan een eenvoudige “usage rule” per model hetzelfde doen: verwacht aantal vellen per laptop (meestal 0 of 1) × kans dat vervanging nodig is × geplande laptophoeveelheid.

## 10. Dashboardvoorstel

### 10.1 Operationeel

- afboekingen vandaag/deze week;
- nulvoorraad en lage dekking;
- open tellingen en verschillen;
- te verwerken ontvangsten;
- recente transacties en undo/correcties;
- zoekopdrachten zonder resultaat.

### 10.2 Planning en inkoop

- SKU’s onder reorder point;
- voorraaddekking 7/30/90/180 dagen;
- voorspelde stockout vóór ontvangst;
- besteladvies met MOQ, ordermultiple en leverancier;
- open en te late bestellingen;
- snelste dalers;
- topverbruik;
- laptopvraag versus stickerbeschikbaarheid.

### 10.3 Management

- totale voorraad en waarde;
- stockout-rate en fill rate;
- voorraadnauwkeurigheid uit tellingen;
- dead/slow stock, bijvoorbeeld geen echte vraag in 180/365 dagen;
- ABC/XYZ/criticality-matrix;
- forecast bias en fout per segment;
- voorraadomloopsnelheid;
- afboekingen per model/layout/taal;
- operationele blokkades door stickervoorraad.
- verdeling over de vier conversiemethoden;
- kosten en arbeidstijd per methode, waardeklasse en layout;
- first-pass yield, herwerk en klachten per methode;
- aantal beleidsafwijkingen en afwijkingsreden;
- marge-impact: conversiekosten versus verkoopwaarde;
- aandeel van de uit te faseren losse stickers.

### 10.4 Printer en conversiecapaciteit

- jobs in wachtrij per methode;
- verwachte doorlooptijd en capaciteitsbenutting;
- directe reprint: prints, cyclustijd, first-pass yield en herprints;
- sterkere geprinte stickers: geproduceerd, toegepast, scrap en resterende voorraad;
- voorraad primer, inkt, reinigingsvloeistof, stickergrondstof en andere consumables;
- machines in storing/onderhoud;
- ontbrekende of nog niet goedgekeurde model-layouttemplates;
- orders waarvoor de voorkeursmethode niet beschikbaar is.

### 10.5 Datakwaliteit

- dubbele of ontbrekende SKU’s;
- modellen zonder canonieke mapping;
- onbevestigde compatibiliteit;
- SKU’s zonder leverancier/levertijd/min-max;
- negatieve of verdachte mutaties;
- importfouten.

Ontwerp dashboards als uitzonderingenlijsten met doorklik naar actie. Een totaalgetal zonder eigenaar of vervolgstap is minder waardevol.

## 11. Integraties

### 11.1 Barcode en QR

HID-scanners die zich als toetsenbord gedragen zijn de eenvoudigste start. Ondersteun daarnaast camera-scanning op tablet/telefoon. Code 128 is geschikt voor compacte interne SKU-labels; QR/Data Matrix kan meer informatie of een URL bevatten. Gebruik in de barcode primair een stabiele identifier, geen veranderlijke voorraad of locatie.

GS1/GTIN is relevant wanneer leveranciers gestandaardiseerde handelsartikelen leveren. Voor interne, niet-verhandelde items kan een interne identifier volgens de traceability-context volstaan. Voorkom dat één barcode tegelijk SKU, aantal en actuele locatie “waarheid” maakt.

### 11.2 Laptopdatabase

- Voorkeur: read-only API of periodieke snapshotimport.
- Canonieke externe model-ID bewaren.
- Mappingreview voor onbekende modellen.
- Later eventgedreven reservering bij instroom of werkorder.

### 11.3 ERP/WMS

- Masterdata en inkooporders via versieerbare REST/JSON API of bestandimport.
- Duidelijke systeemeigenaar per gegeven: bijvoorbeeld ERP voor leverancier/order, stickerapp voor compatibiliteit en operationeel verbruik.
- Webhooks/outbox voor betrouwbare gebeurtenissen.
- Geen dubbel boekhoudkundig voorraadbeheer zonder reconciliatieregels.

### 11.4 Magento

Magento is waarschijnlijk geen directe bron voor intern stickervelverbruik. Koppel alleen wanneer verkooporders/verkoopmarkt aantoonbaar gewenste layoutvraag veroorzaken. Gebruik order- of productevents, niet screen scraping.

### 11.5 Excel/CSV

- Importwizard met kolommapping, preview, validatie en foutbestand.
- Dry run vóór commit.
- Herhaalbare imports via externe sleutel en idempotentie.
- Export van gefilterde lijsten en transacties; geen export die later ongecontroleerd de master overschrijft.

### 11.6 Labelprinters

- Label bevat SKU, korte layout/modelgroep, locatie/bak en barcode.
- Printtemplates per formaat/printer.
- Herdruk wordt gelogd; barcode blijft dezelfde SKU-identiteit.

## 12. Technisch ontwerp en architectuuradvies

### 12.1 Aanbevolen doelarchitectuur

Een modulaire monoliet is de beste balans voor fase 1: één deploybare backend met helder gescheiden domeinmodules, één relationele database en een responsieve web/PWA-client. Microservices voegen nu operationele complexiteit toe zonder bewezen schaalbehoefte.

Modules:

- identiteit en autorisatie;
- catalogus/masterdata;
- compatibiliteit;
- voorraad en transacties;
- tellingen;
- inkoop/ontvangst;
- planning/forecast;
- integraties/import;
- meldingen;
- rapportage/audit.
- conversieadvies en versieerbaar beleidsbeheer;
- productie-/conversieorders, machinecapaciteit en kwaliteitscontrole.

Technische eigenschappen:

- PostgreSQL of gelijkwaardige relationele database;
- transactionele API;
- optimistic locking of rijvergrendeling op balansregels;
- idempotente mutatie-endpoints;
- object storage voor foto’s/documenten;
- achtergrondtaken voor imports, alerts en forecasts;
- centrale logging, metrics, tracing en foutmonitoring;
- dagelijkse back-up en getest herstel;
- SSO via bestaande bedrijfsidentiteit indien beschikbaar;
- versleuteling in transit en at rest;
- geautomatiseerde tests op voorraad-invarianten.
- een uitlegbare regelmotor voor waardedrempel, layout, compatibiliteit, capaciteit en fallback; geen ondoorzichtige AI-beslisser voor de operationele keuze.

### 12.2 Belangrijke invarianten

- Geen mutatie zonder gebruiker/service-identiteit, tijd, reden en correlation-ID.
- Een normale uitgifte kan on-hand niet onder nul brengen.
- Een SKU-code en barcode zijn uniek binnen hun scope.
- Een compatibiliteitskoppeling verwijst naar bestaande actieve records.
- Transfer uit en in is atomair en netto nul.
- Balans en transacties kunnen dagelijks worden gereconcilieerd.
- Externe retry veroorzaakt nooit een dubbele boeking.

### 12.3 Rapportagearchitectuur

Voor de MVP kunnen dashboards uit relationele views/materialized views komen. Splits pas later naar een datawarehouse wanneer volume, integraties of historisch BI-gebruik dat rechtvaardigen. Bewaar vanaf dag één tijdstippen en snapshots op een analysevriendelijke manier.

### 12.4 Offline

Een PWA kan beperkte offline ondersteuning krijgen, maar voorraadmutaties bij meerdere apparaten zijn conflictgevoelig. Advies:

- MVP online-first met duidelijke verbindingsstatus;
- later offline wachtrij met lokaal unieke ID, actor/device en tijd;
- server valideert in volgorde en meldt conflicten expliciet;
- geen lokaal berekende definitieve voorraad als meerdere apparaten actief zijn.

### 12.5 Niet-functionele eisen

- gebruikelijke zoekactie <1 seconde bij normale interne belasting;
- normale mutatie <2 seconden inclusief zichtbare bevestiging;
- beschikbaarheid passend bij werktijden en productie-impact;
- WCAG 2.2 AA als acceptatiedoel;
- volledige auditretentie conform intern beleid;
- herstelpunt en hersteltijd expliciet afspreken;
- Nederlandse UI, met consistente Engelse technische codes waar nodig;
- exporteerbaarheid en leveranciersneutraliteit van data.

## 13. Risicoanalyse

| Risico | Kans/impact | Beheersing |
|---|---|---|
| Slechte brondata wordt blind gemigreerd | Hoog/hoog | staging, deduplicatie, eigenaar per review, openingsvoorraad tellen |
| Verkeerde compatibiliteit blokkeert of beschadigt laptop | Middel/hoog | status, fysieke test, bron, foto, vier-ogen bij kritieke wijziging |
| Gebruikers blijven Excel gebruiken | Hoog/hoog | scan-first UX, training, cut-overdatum, Excel read-only archief |
| Systeemvoorraad wijkt af van bakken | Middel/hoog | cycle counts, transactiediscipline, locatiebarcode, afwijkingsdashboard |
| Dubbel afboeken door retries/scans | Middel/hoog | idempotency key, debounce, zichtbare feedback, undo |
| Forecast wekt schijnzekerheid | Hoog/middel | intervals/aannames tonen, benchmarken, pas activeren met voldoende historie |
| Laptopmapping telt vraag dubbel | Middel/hoog | allocatieregels en expliciete alternatieven |
| Negatieve voorraad wordt verborgen | Middel/hoog | blokkade en correctieworkflow |
| Leverancierslevertijd is theoretisch i.p.v. werkelijk | Hoog/middel | werkelijke ontvangstdata meten en variatie gebruiken |
| Offline synchronisatieconflict | Middel/middel | online-first, beperkte queue, conflictworkflow |
| Integratie-eigenaarschap onduidelijk | Middel/hoog | data ownership matrix en contracttests |
| Te veel scope in eerste release | Hoog/hoog | strikte MVP en beslispoorten |
| Persoonsdata/audit te ruim toegankelijk | Laag/middel | least privilege, bewaartermijn, audittoegang beperken |

## 14. Prioriteiten

### Must have — MVP

- gevalideerde import en dataopschoning;
- masterdata voor alle vier conversiemethoden en hun lifecycle-status;
- configureerbare, versieerbare beslisregels met initiële €300-grens;
- advies én werkelijk gekozen methode per laptop/order, inclusief afwijkingsreden;
- SKU’s, layouts, canonieke laptopmodellen, aliases en many-to-many compatibiliteit;
- voorraad per locatie;
- afboeken, ontvangen, transfer, tellen en corrigeren met transactielog;
- snelle zoekfunctie en barcode/HID-scanner;
- lage voorraad/reorder-point alerts;
- gebruikersrollen en audittrail;
- operationeel dashboard;
- Excel/CSV export;
- back-up, monitoring en reconciliatie;
- openingsvoorraad via fysieke telling.
- kwaliteitsresultaat en herwerkregistratie voor risicovolle sticker- en printprocessen.

### Should have

- leveranciers, levertijden, MOQ en open inkooporders;
- besteladvies met min/max en safety stock;
- laptopvoorraadsnapshot en dekking;
- camera-scanning;
- cycle-countplanning op ABC/criticality;
- foto’s en compatibiliteitsbewijs;
- labelprinten;
- notificaties binnen de organisatie;
- bulkmutaties met beveiligde workflow.
- printer/arbeidsplaatscapaciteit, consumables en templatebeschikbaarheid;
- orderwachtrij voor keyboardconversie.

### Could have

- forecasting per vraagtype na voldoende historie;
- XYZ-analyse en forecastmonitoring;
- PWA offline wachtrij;
- reserveringen per refurbishbatch/workorder;
- API/webhooks voor ERP/WMS/Magento;
- heatmaps en geavanceerde trendanalyse;
- automatische leverancier-prestatiemeting.

### Nice to have

- AI-ondersteunde modelnormalisatie met menselijke goedkeuring;
- AI-verklaring van uitzonderingen;
- computer vision voor velherkenning;
- wearables/haptische scanners;
- dynamische orderoptimalisatie;
- dark mode en persoonlijke favorieten, tenzij gebruikersvalidatie ze eerder prioriteert.

## 15. Migratie- en implementatieadvies

### Fase 0 — Besluiten en data-eigenaarschap

- Bevestig betekenis van `Productie` en `Voorraad `.
- Wijs proceseigenaar, data-eigenaar en technisch eigenaar aan.
- Kies canoniek artikelnummerbeleid en fysieke locaties.
- Leg vast wanneer een laptop een sticker “nodig” heeft.
- Stel servicelevels en escalatie-eigenaren vast.
- Benoem en codeer de vier methoden definitief; koppel ieder fysiek materiaal en iedere printer.
- Definieer “verkoopwaarde” bij de €300-grens: bron, btw-behandeling en meetmoment.
- Leg de normale voorkeursvolgorde en bevoegdheden voor afwijking vast.
- Bevestig welke methode “Noviply direct geprint” precies is en welke printer/grondstoffen daarbij horen.
- Valideer de directe keyboardprintstappen, waaronder de genoemde blue-light/uitharding, met operator en leverancier.

### Fase 1 — Datacleaning en prototypevalidatie

- Dubbelen reviewen, niet automatisch samenvoegen.
- Vrije compatibiliteit splitsen naar kandidaatmodellen.
- Fysieke pasvormstatussen controleren.
- Ontbrekende leveranciers, locaties en parameters aanvullen.
- Taakflows testen met operators op de werkvloer.
- Meet met een korte tijdstudie per methode: voorbereiding, toepassing/print, QC, herwerk en uitval.
- Verzamel minimaal kostprijs, arbeidstijd, materiaalverbruik en klacht-/garantie-informatie per methode.

### Fase 2 — MVP en cut-over

- Masterdata en transacties activeren.
- Alle bakken fysiek tellen en openingssaldo boeken.
- Labels plaatsen.
- Excel als read-only archief bewaren.
- Pilot op één locatie/ploeg, daarna gecontroleerde uitrol.
- Start methodeadvies in “adviesmodus”: medewerker bevestigt of wijkt gemotiveerd af; analyseer afwijkingen vóór automatische handhaving.

### Fase 3 — Planning en koppelingen

- Inkooporders en laptopvoorraad koppelen.
- Min/max kalibreren.
- Datakwaliteit en voorraadnauwkeurigheid wekelijks beoordelen.

### Fase 4 — Forecasting

- Minimaal 3–6 maanden schone historie beoordelen.
- Baselines en intermitterende methoden backtesten.
- Alleen modellen activeren die voorraad-KPI’s aantoonbaar verbeteren.

## 16. Acceptatiecriteria voor de latere MVP

- Een operator kan binnen maximaal enkele seconden een bekende SKU/model vinden en één vel afboeken.
- Iedere mutatie is herleidbaar naar wie, wat, wanneer, waar en waarom.
- Het systeem voorkomt een normale uitgifte onder nul.
- Eén SKU kan zonder dubbel onderhoud aan meerdere modellen worden gekoppeld.
- Zoeken op ieder gekoppeld model vindt de juiste, goedgekeurde SKU.
- Voorraad per locatie en totaal zijn zichtbaar en reconcilieerbaar.
- Een ontvangst of transfer kan niet half worden geboekt.
- Lage voorraad en verwachte tekorten hebben een eigenaar en status.
- Import toont fouten vóórdat gegevens definitief worden geschreven.
- Een fysieke telling kan verschillen registreren zonder historie te overschrijven.
- Kernflows zijn bruikbaar met muis, toetsenbord, touch en gangbare HID-scanner.

## 17. Extra functies met hoge potentiële waarde

- **No-match queue:** registreert modellen waarop vaak wordt gezocht maar waarvoor geen vel is gevonden; direct input voor assortiment en compatibiliteitswerk.
- **Substitutiebeleid:** voorkeurs-SKU en toegestane alternatieven met rangorde; voorkomt dubbel tellen van dekking.
- **Kwaliteitsblokkade:** blokkeer een partij/SKU bij verkeerde opdruk, kleur of pasvorm.
- **Usage probability per model:** niet iedere laptop heeft een sticker nodig; meet werkelijke ratio per model en herkomstbatch.
- **Stockout capture:** registreer gemiste behoefte, anders ziet forecasting alleen wat kon worden uitgegeven.
- **Supplier scorecard:** werkelijke versus beloofde levertijd, volledigheid en kwaliteit.
- **Alert fatigue control:** groepeer meldingen, gebruik ernst en wijs een eigenaar toe; stuur niet dagelijks dezelfde ongeadresseerde waarschuwing opnieuw.
- **Reconciliation report:** dagelijkse controle tussen transacties en balans, plus wekelijkse fysieke uitzonderingen.
- **Decision log:** leg handmatige override van besteladvies vast om later beleid te verbeteren.

## 18. Conclusie en besluitvoorstel

Het project is gerechtvaardigd: de huidige Excel bevat nuttige domeinkennis, maar de structuur kan de gewenste betrouwbaarheid, forecasting en integraties niet dragen. Door de vier conversiemethoden is de bedrijfswaarde bovendien groter dan voorraadbeheer alleen. Het systeem moet materiaal, methodekeuze, machinecapaciteit, kwaliteit en herwerk verbinden. De eerste investering moet niet naar dashboards of AI gaan, maar naar een correct domeinmodel, uitlegbare beslisregels en foutarme mutatie- en uitvoeringsregistratie.

Voorgesteld besluit:

1. Keur de doelrichting “responsieve web/PWA + relationele database + append-only transactielog” goed.
2. Bevestig dat SKU/layoutvariant en laptopmodel afzonderlijke entiteiten zijn met een many-to-many compatibiliteitsrelatie.
3. Plan een korte validatieworkshop met stickeroperator, voorraadbeheerder, inkoper en eigenaar van de laptopdatabase.
4. Laat vóór ontwikkeling de drie dubbele artikelnummers, zes dubbele modelnamen, kantoorvoorraad en ontbrekende artikelnummers inhoudelijk beoordelen.
5. Leg in dezelfde workshop de vier methoden, €300-definitie, voorkeursvolgorde, uitzonderingen, printers, consumables, kwaliteitscontrole en blue-lightstap definitief vast.
6. Definieer daarna de MVP-backlog en UX-prototype; begin pas na goedkeuring met applicatiecode.

## 19. Bronnen

- Microsoft Learn, [Replenishment overview](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/replenishment) — min/max- en demand replenishment.
- Microsoft Learn, [Define cycle counting](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/tasks/define-cycle-counting-microsoft-dynamics-365-finance-operations-enterprise-edition-july-2017) — cycle counting en mobiele warehouseflow.
- Microsoft Learn, [Scan bar codes using a camera](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/scan-bar-codes-using-a-camera) — camera-scanning en ondersteunde barcodes.
- Microsoft Learn, [Warehouse mobile device tracking dimensions and picking behavior](https://learn.microsoft.com/en-us/dynamics365/supply-chain/warehousing/warehouse-mobile-device-tracking-dimensions-license-plate-picking-behavior) — minimaliseren van scanning en handmatige invoer.
- Microsoft Learn, [Touch interactions](https://learn.microsoft.com/en-us/windows/apps/develop/input/touch-interactions) — touchdoelen en responsieve interactie.
- Oracle, [Inventory Optimization](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/article_1155215810.html) — segmentatie, servicelevels, safety stock en reorder point.
- Oracle, [Reorder Point Planning](https://docs.oracle.com/cd/A60725_05/html/comnls/us/inv/roplan.htm) — reorder point, lead-time demand, safety stock en EOQ.
- Apple, [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) — control size, spacing en alternatieve input.
- Nielsen Norman Group, [Ten Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — foutpreventie, status, consistentie en recognition over recall.
- GS1, [Global Traceability Standard](https://ref.gs1.org/standards/global-traceability/2.0.0/) — identificatie en traceerbaarheidsgegevens.
- Hyndman & Athanasopoulos, [Forecasting: Principles and Practice — time series of counts](https://otexts.com/fpp3/counts.html) — Croston en beperkingen.
- Babai et al., [A new method to forecast intermittent demand in the presence of inventory obsolescence](https://doi.org/10.1016/j.ijpe.2018.01.026) — SBA/TSB en obsolescentie.
- Teunter, Syntetos & Babai, [Intermittent demand: Linking forecasting to inventory obsolescence](https://doi.org/10.1016/j.ejor.2011.07.018) — vraagkans bij nulperioden.
- Syntetos & Boylan, [On the stock control performance of intermittent demand estimators](https://doi.org/10.1016/j.ijpe.2005.04.004) — voorraadprestatie van intermitterende forecastmethoden.
- Noviply, [Laptop Keyboard Sticker](https://noviply.com/laptop-keyboard-sticker/) — model-/taalspecifieke stickervellen, materiaaleigenschappen en toepassing.
- Noviply, [Laptop Keyboard Reprinting](https://noviply.com/laptop-keyboard-reprinting/) — leveranciersvergelijking tussen stickers en directe reprint; als commerciële bron geïnterpreteerd.
- Keyboard Print, [Remote Print](https://www.keyboardprint.ro/remote-print) — in-house printercapaciteit, cyclustijd, ontwerpen, consumables en ondersteuning.
- Keyboard Print, [Digital Reprint](https://www.keyboardprint.ro/digital-reprint) — processtappen, backlit-ondersteuning en kwaliteitscontrole.
