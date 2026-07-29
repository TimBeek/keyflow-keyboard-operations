-- Niet elke layout kan door de toetsenbordsprinter in Roemenië. Tot nu toe
-- adviseerde KeyFlow die methode altijd boven de drempel, ook voor talen die er
-- niet uit kunnen komen — en dan staat de medewerker met een laptop in zijn
-- hand en een advies dat niet uit te voeren is.
--
-- Welke layouts wél kunnen is geen code maar beleid: Roemenië voegt talen toe.
-- Daarom staat het bij de rest van het conversiebeleid, met dezelfde versie
-- eromheen zodat twee beheerders elkaar niet overschrijven.

alter table operations_settings
  add column if not exists direct_print_layouts jsonb not null default '[]'::jsonb;

alter table operations_settings
  add constraint operations_settings_direct_print_layouts_array
  check (jsonb_typeof(direct_print_layouts) = 'array');

-- Welke laptop welke methode kreeg staat al in het logboek. Wat er nog niet in
-- stond: dat een laptop eigenlijk een toetsenbordsprint hoorde te krijgen en
-- daar niet doorheen kwam. Precies die lijst moet naar Roemenië.
alter table conversion_log
  add column if not exists fell_back_from text;

create index if not exists conversion_log_fallback_idx
  on conversion_log (occurred_at desc)
  where fell_back_from is not null;
