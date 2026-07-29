-- Notebook Service kan niet "een taal" of "geen taal": ze kunnen een taal voor
-- een bepaald model. Dezelfde Duitse layout kan wel voor een ThinkPad T480 en
-- niet voor een Yoga 11e. Eén lijst voor alles zou dus zowel te veel als te
-- weinig toestaan.
--
-- Daarom hun catalogus zoals hij is: product, en daaronder de varianten.

create table direct_print_products (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  -- De naam zoals Roemenië hem schrijft, ongewijzigd: daarmee kunnen we
  -- terugpraten over hun eigen regels.
  source_name text not null,
  -- Genormaliseerd voor het zoeken op onze eigen modelnamen.
  normalized_name text not null,
  form_factor text not null default '',
  imported_at timestamptz not null default now(),
  constraint direct_print_products_source_uq unique (manufacturer, source_name)
);

create index direct_print_products_normalized_idx
  on direct_print_products (normalized_name);

create table direct_print_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references direct_print_products(id) on delete cascade,
  -- Hun eigen code, bijvoorbeeld "US-to-NL" of "SE-FI".
  source_layout text not null,
  -- Onze layout, of leeg als we hem niet kennen.
  keyflow_layout text not null default '',
  -- "US-to-NL" betekent: van een US-toetsenbord naar NL. Dat is precies wat wij
  -- doen, en iets anders dan een versleten NL opnieuw printen.
  converts_from text not null default '',
  backlit boolean not null default false,
  trackpoint boolean not null default false,
  constraint direct_print_variants_uq
    unique (product_id, source_layout, backlit, trackpoint)
);

create index direct_print_variants_layout_idx
  on direct_print_variants (keyflow_layout)
  where keyflow_layout <> '';
