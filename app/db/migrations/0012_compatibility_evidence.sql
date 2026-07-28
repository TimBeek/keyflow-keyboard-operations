create table if not exists compatibility_evidence (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  catalog_key text not null,
  sku_id uuid not null references sticker_skus(id),
  model_id uuid not null references laptop_models(id),
  status keyboard_reference_status not null,
  variant_code text not null,
  manufacturer_part_number text not null,
  photo_reference text not null,
  keyboard_width_mm integer not null,
  keyboard_height_mm integer not null,
  checkpoints jsonb not null,
  notes text,
  reviewed_by uuid not null references users(id),
  reviewed_at timestamptz not null default now(),
  constraint compatibility_evidence_width_range
    check (keyboard_width_mm between 150 and 500),
  constraint compatibility_evidence_height_range
    check (keyboard_height_mm between 50 and 250)
);

create unique index if not exists compatibility_evidence_idempotency_key_uq
  on compatibility_evidence (idempotency_key);

create index if not exists compatibility_evidence_lookup_idx
  on compatibility_evidence (model_id, sku_id, reviewed_at desc);

comment on table compatibility_evidence is
  'Versiegebonden fysieke model/SKU-pastesten. Alleen de laatste approved beoordeling mag als werknemersbewijs worden getoond.';
