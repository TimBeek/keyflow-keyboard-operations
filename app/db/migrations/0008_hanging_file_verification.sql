do $$ begin
  create type sticker_verification_outcome as enum (
    'passed',
    'blocked_unused',
    'scrapped'
  );
exception when duplicate_object then null;
end $$;

alter table sticker_skus
  add column if not exists hanging_file_number integer;

do $$ begin
  alter table sticker_skus
    add constraint sticker_skus_hanging_file_number_positive
    check (hanging_file_number is null or hanging_file_number > 0);
exception when duplicate_object then null;
end $$;

create unique index if not exists sticker_skus_hanging_file_number_uq
  on sticker_skus (hanging_file_number)
  where hanging_file_number is not null;

comment on column sticker_skus.hanging_file_number is
  'Fysieke locatie in de genummerde hangmappenwagen; afkomstig uit Excel-kolom nr.';

comment on column inventory_import_rows.source_number is
  'Fysiek hangmapnummer uit Excel-kolom nr.; niet alleen een administratieve volgorde.';

create table if not exists sticker_verification_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references conversion_jobs(id),
  order_reference text not null,
  sku_id uuid not null references sticker_skus(id),
  hanging_file_number integer not null check (hanging_file_number > 0),
  model_name text not null,
  target_layout_id uuid not null references keyboard_layouts(id),
  variant text not null,
  outcome sticker_verification_outcome not null,
  failure_reason text,
  inventory_transaction_id uuid references inventory_transactions(id),
  checked_by uuid not null references users(id),
  checked_at timestamptz not null default now()
);

create index if not exists sticker_verification_reports_order_idx
  on sticker_verification_reports (order_reference, checked_at desc);

create index if not exists sticker_verification_reports_sku_idx
  on sticker_verification_reports (sku_id, checked_at desc);
