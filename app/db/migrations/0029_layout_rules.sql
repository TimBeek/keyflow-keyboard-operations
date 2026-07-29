-- Het advies koos de methode op verkoopwaarde: boven de grens een
-- toetsenbordsprint, eronder een sticker. Die regel staat in code, en dat is de
-- verkeerde plek — want soms geldt er iets anders voor één taal. "Nederlands
-- altijd met de premiumsticker" is beleid, geen programmeerwerk.
--
-- Een uitzondering per doeltaal, bij de rest van het conversiebeleid, met
-- dezelfde versie eromheen zodat twee beheerders elkaar niet overschrijven.

alter table operations_settings
  add column if not exists layout_rules jsonb not null default '[]'::jsonb;

alter table operations_settings
  add constraint operations_settings_layout_rules_array
  check (jsonb_typeof(layout_rules) = 'array');

-- De levertijd van Noviply stond als vaste veertien dagen in de code. Levert
-- Noviply sneller of trager, dan hoort dat een instelling te zijn en geen
-- nieuwe versie van de app.
alter table operations_settings
  add column if not exists resupply_lead_time_days integer not null default 14;

alter table operations_settings
  add column if not exists resupply_safety_weeks integer not null default 1;

alter table operations_settings
  add constraint operations_settings_resupply_sane
  check (
    resupply_lead_time_days between 1 and 120
    and resupply_safety_weeks between 0 and 12
  );
