-- De layouttabel dekte acht talen, maar de app biedt er dertien aan. Een
-- melding "dit vel past niet" voor een Spaanse of Belgische layout liep daardoor
-- vast op een layout die de database niet kende — en dan komt de melding
-- helemaal niet aan bij management.
--
-- België ontbrak ook in de app zelf, terwijl de artikelnummers BE al toestaan.

insert into keyboard_layouts (code, name, language_code, family, exact)
values
  ('AZERTY_BE', 'AZERTY BE', 'nl-BE', 'AZERTY', true),
  ('QWERTY_UK', 'QWERTY UK', 'en-GB', 'QWERTY', true),
  ('QWERTY_ES', 'QWERTY ES', 'es-ES', 'QWERTY', true),
  ('QWERTY_IT', 'QWERTY IT', 'it-IT', 'QWERTY', true),
  ('QWERTY_PT', 'QWERTY PT', 'pt-PT', 'QWERTY', true),
  ('QWERTY_PL', 'QWERTY PL', 'pl-PL', 'QWERTY', true)
on conflict (code) do nothing;
