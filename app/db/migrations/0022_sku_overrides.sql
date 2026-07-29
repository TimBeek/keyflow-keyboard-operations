-- Negen hangmappen kwamen zonder bruikbaar artikelnummer uit de Excel. Die zijn
-- in de app aan te vullen, maar dat aanvullen stond alleen in de browser van
-- degene die het deed — voor iedereen anders bleef de hangmap leeg.
--
-- De bron blijft ongemoeid: dit is een correctie erbovenop, met wie en wanneer,
-- zodat een volgende import hem niet stilzwijgend overschrijft.

create table sku_overrides (
  catalog_key text primary key,
  sku text not null,
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now(),
  constraint sku_overrides_catalog_key_shape
    check (catalog_key ~ '^hangmap-[0-9]{3}$'),
  constraint sku_overrides_sku_shape
    check (sku ~ '^NB[0-9]+E[0-9]+(NL|FR|DE|BE|UK|SE|NO|DK|ES|IT|PT|PL)$')
);
