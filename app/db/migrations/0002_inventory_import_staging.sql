create table if not exists inventory_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  source_sha256 text not null,
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'ready', 'applied', 'failed')),
  record_count integer not null default 0,
  total_quantity integer not null default 0,
  error_count integer not null default 0,
  warning_count integer not null default 0,
  review_count integer not null default 0,
  imported_by uuid not null references users(id),
  imported_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (source_sha256)
);

create table if not exists inventory_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references inventory_import_batches(id) on delete cascade,
  source_sheet text not null,
  source_row integer not null,
  source_number integer,
  model_name text not null,
  normalized_model_name text not null,
  quantity integer,
  layout_name text,
  sku text,
  linked_models_text text,
  notes text,
  raw_data jsonb not null,
  resolution_status text not null default 'pending'
    check (resolution_status in ('pending', 'approved', 'rejected', 'merged')),
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  unique (batch_id, source_sheet, source_row)
);

create index if not exists inventory_import_rows_batch_idx
  on inventory_import_rows (batch_id, source_row);

create table if not exists inventory_import_issues (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references inventory_import_batches(id) on delete cascade,
  import_row_id uuid references inventory_import_rows(id) on delete cascade,
  severity text not null check (severity in ('error', 'warning', 'review')),
  field_name text not null,
  issue_code text not null,
  message text not null,
  resolved boolean not null default false,
  resolution_note text,
  resolved_by uuid references users(id),
  resolved_at timestamptz
);

create index if not exists inventory_import_issues_open_idx
  on inventory_import_issues (batch_id, severity)
  where resolved = false;
