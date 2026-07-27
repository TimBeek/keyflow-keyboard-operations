create extension if not exists pgcrypto;

do $$ begin
  create type record_status as enum ('active', 'inactive', 'phasing_out');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type compatibility_status as enum ('unverified', 'tested', 'conditional', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type inventory_transaction_type as enum (
    'opening', 'issue', 'receipt', 'transfer_out', 'transfer_in',
    'adjustment', 'reservation', 'release'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type conversion_job_status as enum (
    'draft', 'advised', 'released', 'in_progress', 'quality_check',
    'completed', 'blocked', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type quality_result as enum ('passed', 'rework', 'scrap', 'blocked');
exception when duplicate_object then null;
end $$;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  display_name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists laptop_models (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references manufacturers(id),
  family text,
  model_name text not null,
  normalized_name text not null unique,
  status record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists model_aliases (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references laptop_models(id),
  alias text not null,
  normalized_alias text not null unique,
  source text not null default 'manual'
);

create table if not exists keyboard_layouts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  language_code text not null,
  active boolean not null default true
);

create table if not exists conversion_methods (
  code text primary key,
  name text not null,
  status record_status not null default 'active',
  quality_tier integer not null,
  requires_quality_check boolean not null default false
);

create table if not exists sticker_skus (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  layout_id uuid not null references keyboard_layouts(id),
  method_code text not null references conversion_methods(code),
  barcode text unique,
  status record_status not null default 'active',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists sku_model_compatibility (
  sku_id uuid not null references sticker_skus(id),
  model_id uuid not null references laptop_models(id),
  status compatibility_status not null default 'unverified',
  notes text,
  source text,
  tested_at timestamptz,
  tested_by uuid references users(id),
  primary key (sku_id, model_id)
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  barcode text unique,
  active boolean not null default true
);

create table if not exists inventory_balances (
  sku_id uuid not null references sticker_skus(id),
  location_id uuid not null references locations(id),
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (sku_id, location_id)
);

create table if not exists inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references sticker_skus(id),
  location_id uuid not null references locations(id),
  type inventory_transaction_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason_code text not null,
  notes text,
  reference_type text,
  reference_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null unique,
  performed_by uuid not null references users(id),
  occurred_at timestamptz not null default now()
);

create index if not exists inventory_transactions_sku_time_idx
  on inventory_transactions (sku_id, occurred_at desc);

create table if not exists conversion_policies (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  threshold_eur numeric(10,2) not null,
  rules jsonb not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists conversion_jobs (
  id uuid primary key default gen_random_uuid(),
  laptop_model_id uuid not null references laptop_models(id),
  external_laptop_id text,
  order_reference text,
  current_layout_id uuid not null references keyboard_layouts(id),
  target_layout_id uuid not null references keyboard_layouts(id),
  sale_value_eur numeric(10,2) not null,
  advised_method_code text not null references conversion_methods(code),
  chosen_method_code text references conversion_methods(code),
  policy_id uuid not null references conversion_policies(id),
  override_reason text,
  status conversion_job_status not null default 'draft',
  operator_id uuid references users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists quality_checks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references conversion_jobs(id),
  result quality_result not null,
  defect_code text,
  notes text,
  checked_by uuid not null references users(id),
  checked_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

insert into conversion_methods (code, name, status, quality_tier, requires_quality_check)
values
  ('loose_stickers', 'Losse stickers', 'phasing_out', 1, true),
  ('noviply_sheet', 'Noviply voorraadvel', 'active', 2, true),
  ('printed_sticker', 'Sterke printsticker', 'active', 3, true),
  ('direct_reprint', 'Directe keyboardprint', 'active', 4, true)
on conflict (code) do update set
  name = excluded.name,
  status = excluded.status,
  quality_tier = excluded.quality_tier,
  requires_quality_check = excluded.requires_quality_check;

insert into keyboard_layouts (code, name, language_code)
values
  ('QWERTY_US', 'QWERTY US', 'en-US'),
  ('AZERTY_FR', 'AZERTY FR', 'fr-FR'),
  ('QWERTZ_DE', 'QWERTZ DE', 'de-DE')
on conflict (code) do nothing;

insert into locations (code, name)
values
  ('STICKER_AFDELING', 'Stickerafdeling'),
  ('KANTOOR', 'Kantoorvoorraad')
on conflict (code) do nothing;
