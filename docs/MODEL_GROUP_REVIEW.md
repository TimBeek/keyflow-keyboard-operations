# AI-ondersteunde modelgroepbeoordeling

KeyFlow maakt kandidaatgroepen uit de gecontroleerde Excelbron. De assistent vergelijkt:

- modellen die op dezelfde bronregel staan;
- exact Noviply-SKU en hangmapnummer;
- gewenste keyboardlayout;
- E1/E2-code uit het artikelnummer;
- modellen die ook aan een andere SKU/layout-combinatie zijn gekoppeld.

De getoonde bronmatch is alleen een prioriteringsscore. Deze blijft bewust onder 80%, omdat modelnamen en een gedeelde SKU geen fysiek compatibiliteitsbewijs vormen.

## Managementwachtrij

Management kan ieder voorstel:

1. openen en alle voorgestelde modellen controleren;
2. bronconflicten bekijken;
3. het exacte fabrikantonderdeelnummer invullen;
4. een foto- of documentreferentie vastleggen;
5. E1/E2, onderdeelnummer, bovenaanzichtfoto en droge pastest bevestigen;
6. goedkeuren of met reden afwijzen.

Goedkeuren wordt technisch geblokkeerd zolang één verplicht bewijsveld ontbreekt. Bij een bronconflict is daarnaast een inhoudelijke notitie verplicht. Afwijzingen vereisen altijd een reden.

## Veiligheidsgrens

Een voorstel:

- verandert niet automatisch de werknemersroute;
- boekt nooit voorraad;
- wordt niet als fysieke compatibiliteit getoond;
- kan niet zonder persoonlijke managementbeoordeling worden goedgekeurd.

De lokale pilot bewaart de volledige beslisgeschiedenis in de KeyFlow-back-up. Migratie `0011_model_group_review.sql` bereidt dezelfde wachtrij en audit voor PostgreSQL voor. `POST /api/model-groups/reviews` controleert daar de permissie `models.manage`, gebruikt een idempotentiesleutel en weigert onvolledig bewijs vóór databasegebruik.

Een toekomstige externe AI- of zoekprovider kan nieuwe bronverwijzingen toevoegen. Die provider mag nooit de menselijke bewijscontrole of databaseautorisatie omzeilen.
