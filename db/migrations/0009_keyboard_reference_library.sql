do $$ begin
  create type keyboard_reference_status as enum (
    'draft',
    'approved',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

alter table keyboard_layouts
  add column if not exists family text,
  add column if not exists exact boolean not null default true,
  add column if not exists identification_notes text;

update keyboard_layouts
set family = case
  when code like 'QWERTY%' then 'QWERTY'
  when code like 'AZERTY%' then 'AZERTY'
  when code like 'QWERTZ%' then 'QWERTZ'
  else family
end
where family is null;

insert into keyboard_layouts (
  code,
  name,
  language_code,
  family,
  exact,
  identification_notes
)
values
  (
    'QWERTY_NORDIC',
    'QWERTY Nordic (nog specificeren)',
    'und',
    'QWERTY',
    false,
    'Tijdelijke startkeuze voor een Scandinavische inkooplayout; vóór uitvoering specificeren als SE/FI, NO of DK.'
  ),
  (
    'QWERTY_SE_FI',
    'QWERTY SE/FI',
    'sv-FI',
    'QWERTY',
    true,
    'Zweeds/Finse letterset met Å, Ä en Ö; fysieke vorm altijd per laptopmodel controleren.'
  ),
  (
    'QWERTY_NO',
    'QWERTY NO',
    'nb-NO',
    'QWERTY',
    true,
    'Noorse letterset met Å, Æ en Ø; onderscheid met Deens via overige symbooltoetsen en goedgekeurde referentie.'
  ),
  (
    'QWERTY_DK',
    'QWERTY DK',
    'da-DK',
    'QWERTY',
    true,
    'Deense letterset met Å, Æ en Ø; onderscheid met Noors via overige symbooltoetsen en goedgekeurde referentie.'
  ),
  (
    'QWERTY_NL',
    'QWERTY NL',
    'nl-NL',
    'QWERTY',
    true,
    'Nederlands fysiek QWERTY; onderscheid met US International via Enter-vorm, Shift-breedte en symbooltoetsen per model.'
  )
on conflict (code) do update set
  name = excluded.name,
  language_code = excluded.language_code,
  family = excluded.family,
  exact = excluded.exact,
  identification_notes = excluded.identification_notes,
  active = true;

create table if not exists keyboard_layout_references (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid references keyboard_layouts(id),
  model_id uuid references laptop_models(id),
  variant_code text,
  reference_type text not null,
  asset_url text,
  source_url text,
  notes text,
  status keyboard_reference_status not null default 'draft',
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists keyboard_layout_references_lookup_idx
  on keyboard_layout_references (layout_id, model_id, variant_code, status);

comment on table keyboard_layout_references is
  'Beheerbare foto- en bronreferenties voor layout- en E1/E2-controle. Alleen approved records mogen als compatibiliteitsbewijs dienen.';

comment on column keyboard_layout_references.variant_code is
  'Leveranciersvariant zoals E1 of E2; de code is geen taal- of universele geometrieaanduiding.';
