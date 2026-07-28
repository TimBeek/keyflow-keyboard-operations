do $$ begin
  create type stock_count_status as enum (
    'open',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists stock_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  status stock_count_status not null default 'open',
  started_by uuid not null references users(id),
  completed_by uuid references users(id),
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references stock_counts(id),
  idempotency_key text not null,
  sku_id uuid references sticker_skus(id),
  hanging_file_number integer not null check (hanging_file_number > 0),
  source_sku_text text,
  expected_quantity integer not null check (expected_quantity >= 0),
  counted_quantity integer not null check (counted_quantity >= 0),
  difference integer not null,
  reason_code text,
  notes text,
  inventory_transaction_id uuid references inventory_transactions(id),
  counted_by uuid not null references users(id),
  counted_at timestamptz not null default now()
);

create unique index if not exists stock_count_lines_count_hanging_file_uq
  on stock_count_lines (count_id, hanging_file_number);

create unique index if not exists stock_count_lines_idempotency_uq
  on stock_count_lines (idempotency_key);

create index if not exists stock_counts_location_started_idx
  on stock_counts (location_id, started_at desc);

create index if not exists stock_count_lines_difference_idx
  on stock_count_lines (difference)
  where difference <> 0;

comment on table stock_count_lines is
  'Fysieke cycle-countregels per genummerde hangmap, inclusief kloppende tellingen en herleidbare verschillen.';
