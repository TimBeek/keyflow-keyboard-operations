alter table conversion_jobs
  add column if not exists selected_sticker_sku_id uuid references sticker_skus(id);

create table if not exists operations_settings (
  setting_key text primary key,
  threshold_eur numeric(10, 2) not null check (threshold_eur > 0),
  workload text not null check (workload in ('normal', 'busy', 'critical')),
  method_enabled jsonb not null,
  employee_permissions jsonb not null,
  abc_a_threshold integer not null check (abc_a_threshold > 0 and abc_a_threshold < 100),
  abc_b_threshold integer not null check (abc_b_threshold > 0 and abc_b_threshold < 100),
  version integer not null default 1,
  updated_by uuid not null references users(id),
  updated_at timestamptz not null default now(),
  check (abc_a_threshold < abc_b_threshold)
);

insert into operations_settings (
  setting_key,
  threshold_eur,
  workload,
  method_enabled,
  employee_permissions,
  abc_a_threshold,
  abc_b_threshold,
  updated_by
)
values (
  'active',
  300,
  'normal',
  '{
    "loose_stickers": false,
    "noviply_sheet": true,
    "printed_sticker": true,
    "direct_reprint": true
  }'::jsonb,
  '{
    "employee_can_receive": true,
    "employee_can_book_mismatch": true
  }'::jsonb,
  80,
  95,
  '00000000-0000-0000-0000-000000000001'
)
on conflict (setting_key) do nothing;

create index if not exists inventory_transactions_reason_time_idx
  on inventory_transactions (reason_code, occurred_at desc);

create index if not exists conversion_jobs_selected_sticker_sku_idx
  on conversion_jobs (selected_sticker_sku_id)
  where selected_sticker_sku_id is not null;
