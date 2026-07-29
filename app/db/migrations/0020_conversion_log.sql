-- Elke afgeronde conversie, ook die zonder voorraadgevolg. Zonder deze regels
-- is niet te zeggen hoeveel laptops er op een dag doorheen gingen, want alleen
-- het voorraadvel liet een spoor na in de voorraadmutaties.

create type conversion_log_status as enum (
  'completed',
  'awaiting_print'
);

create table conversion_log (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  method text not null references conversion_methods(code),
  status conversion_log_status not null default 'completed',
  model text not null,
  target_layout text not null default '',
  variant text not null default '',
  -- Leeg wanneer er geen voorraadvel aan te pas kwam.
  sku_id uuid references sticker_skus(id),
  source_sku_text text not null default '',
  hanging_file_number integer,
  order_reference text not null default '',
  performed_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint conversion_log_idempotency_uq unique (idempotency_key),
  constraint conversion_log_model_not_blank
    check (length(btrim(model)) > 0),
  constraint conversion_log_hanging_file_positive
    check (hanging_file_number is null or hanging_file_number > 0)
);

-- De rapportage vraagt altijd om een periode, nooit om één regel.
create index conversion_log_occurred_at_idx on conversion_log (occurred_at desc);
create index conversion_log_awaiting_idx
  on conversion_log (occurred_at)
  where status = 'awaiting_print';
