-- Negen hangmappen stonden niet in de database omdat er geen artikelnummer bij
-- stond of omdat twee mappen hetzelfde nummer droegen. Daardoor lagen er 177
-- vellen die de app niet kon uitgeven: wie zo'n laptop had, werd doorgestuurd
-- naar de toetsenbordsprinter terwijl het vel in de kast lag.
--
-- Elke map krijgt hier zijn eigen voorraadsleutel. Staat er een echt nummer van
-- Noviply op, dan blijft dat het nummer dat de werkvloer leest en zegt de
-- sleutel er alleen bij uit welke map het komt (-M36). Stond er niets, dan
-- kennen we zelf een nummer toe met RM ervoor, zodat meteen te zien is dat het
-- niet bij Noviply te bestellen valt.
--
-- De aantallen komen uit de telling van 30 juli 2026.

insert into sticker_skus (sku, name, layout_id, method_code, hanging_file_number, status, notes)
select v.sku, v.naam, l.id, 'noviply_sheet', v.hangmap, 'active', v.opmerking
from (values
  ('RM00030E1NL',      'Dell Latitude 5401 · QWERTY US · E1',         30,  'Zelf toegekend nummer; stond niet in de bronlijst.'),
  ('NB10100E1NL-M36',  'Microsoft Surface Pro 7 · QWERTY US · E1',    36,  'Artikelnummer NB10100E1NL ligt ook in hangmap 147.'),
  ('RM00063E1NL',      'Dell Precision 7540 · QWERTY US · E1',        63,  'Zelf toegekend nummer; stond niet in de bronlijst.'),
  ('NB10021E1NL-M92',  'Microsoft Surface Laptop 3 · QWERTY US · E1', 92,  'Artikelnummer NB10021E1NL ligt ook in hangmap 105.'),
  ('NB10021E1NL-M105', 'Microsoft Surface Laptop 2 · QWERTY US · E1', 105, 'Artikelnummer NB10021E1NL ligt ook in hangmap 92.'),
  ('NB10190E1NL-M110', 'Dell Precision 3560 · QWERTY US · E1',        110, 'Artikelnummer NB10190E1NL ligt ook in hangmap 133.'),
  ('NB10190E1NL-M133', 'Dell Precision 5560 · QWERTY US · E1',        133, 'Artikelnummer NB10190E1NL ligt ook in hangmap 110.'),
  ('NB10100E1NL-M147', 'Microsoft Surface Pro 7 · QWERTY US · E1',    147, 'Artikelnummer NB10100E1NL ligt ook in hangmap 36.'),
  ('RM00148E1NL',      'Fujitsu Lifebook U7410 · QWERTY US · E1',     148, 'Zelf toegekend nummer; stond niet in de bronlijst.')
) as v(sku, naam, hangmap, opmerking)
cross join lateral (select id from keyboard_layouts where code = 'QWERTY_US') as l
on conflict (sku) do nothing;

-- De getelde stand van 30 juli. Een map die al een stand heeft blijft staan:
-- die is dan sinds de telling gebruikt en de database weet het beter.
insert into inventory_balances (sku_id, location_id, on_hand, reserved, version)
select s.id, loc.id, v.aantal, 0, 1
from (values
  (30, 31), (36, 27), (63, 11), (92, 7), (105, 49),
  (110, 22), (133, 19), (147, 11), (148, 0)
) as v(hangmap, aantal)
join sticker_skus s on s.hanging_file_number = v.hangmap
cross join lateral (select id from locations where code = 'HANGMAPPENWAGEN') as loc
on conflict (sku_id, location_id) do nothing;
