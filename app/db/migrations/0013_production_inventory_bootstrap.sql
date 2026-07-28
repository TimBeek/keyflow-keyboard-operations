create table if not exists inventory_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_sha256 text not null unique,
  file_name text not null,
  sheet_name text not null,
  row_count integer not null check (row_count > 0),
  total_quantity integer not null check (total_quantity >= 0),
  status text not null default 'prepared'
    check (status in ('prepared', 'applied', 'failed')),
  imported_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  check (source_sha256 ~ '^[0-9a-f]{64}$'),
  check (
    (status = 'applied' and applied_at is not null)
    or (status <> 'applied' and applied_at is null)
  )
);

create table if not exists inventory_source_rows (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references inventory_source_snapshots(id) on delete cascade,
  source_row integer not null check (source_row > 0),
  catalog_key text not null,
  hanging_file_number integer not null check (hanging_file_number > 0),
  model_name text not null,
  layout_text text not null,
  sku_text text not null,
  opening_quantity integer not null check (opening_quantity >= 0),
  linked_models jsonb not null default '[]'::jsonb,
  notes text,
  data_quality text not null check (data_quality in ('ready', 'blocked')),
  data_quality_issues jsonb not null default '[]'::jsonb,
  sku_id uuid references sticker_skus(id),
  created_at timestamptz not null default now(),
  unique (snapshot_id, source_row),
  unique (snapshot_id, catalog_key),
  unique (snapshot_id, hanging_file_number),
  check (
    (data_quality = 'ready' and sku_id is not null)
    or (data_quality = 'blocked' and sku_id is null)
  )
);

create index if not exists inventory_source_rows_snapshot_quality_idx
  on inventory_source_rows (snapshot_id, data_quality);

comment on table inventory_source_snapshots is
  'Onveranderlijke herkomst van een gecontroleerde productievoorraadimport.';

comment on table inventory_source_rows is
  'Alle Excelbronregels, inclusief geblokkeerde regels die bewust niet operationeel zijn gemaakt.';

comment on column inventory_source_snapshots.source_sha256 is
  'SHA-256 van het volledige oorspronkelijke Excelbestand; voorkomt dubbele of onverklaarde imports.';

comment on column inventory_source_rows.hanging_file_number is
  'Fysieke genummerde positie in de hangmappenwagen.';
