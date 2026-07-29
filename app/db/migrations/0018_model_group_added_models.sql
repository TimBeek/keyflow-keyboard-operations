-- De bron mist soms een model dat wél dezelfde sticker gebruikt. Zonder deze
-- kolom kon een beoordelaar alleen snoeien, niet aanvullen.
alter table model_group_reviews
  add column if not exists added_models jsonb not null default '[]'::jsonb;

comment on column model_group_reviews.added_models is
  'Modellen die de beoordelaar zelf aan het voorstel heeft toegevoegd.';
