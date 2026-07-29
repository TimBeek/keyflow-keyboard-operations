-- Een voorstel klopt vaak grotendeels, maar niet helemaal: één model hoort er
-- niet bij. Zonder deze kolom kon je zo'n groep alleen in zijn geheel afwijzen.
alter table model_group_reviews
  add column if not exists excluded_models jsonb not null default '[]'::jsonb;

comment on column model_group_reviews.excluded_models is
  'Modellen die de beoordelaar uit het voorstel heeft gehaald voordat de groep werd goedgekeurd.';
