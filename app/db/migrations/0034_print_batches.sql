-- De lijst die twee keer per dag naar Noviply gaat, kwam uit het ordersysteem
-- en werd gemaild. Daardoor stond de ronde ergens anders dan de losse
-- aanvragen, en moest iemand twee lijsten naast elkaar leggen om te zien of een
-- apart gelegde laptop erbij zat.
--
-- KeyFlow kent de orders niet, dus zelf genereren zou betekenen dat eerst de
-- hele orderstroom hierheen moet. De lijst inlezen brengt hem wél op één plek.

create table print_batches (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  batch_number integer not null,
  file_name text not null,
  source_sha256 text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references users(id),
  -- Wanneer Noviply hem heeft geopend. Leeg betekent: er hoort een melding bij.
  seen_at timestamptz,
  seen_by uuid references users(id),
  constraint print_batches_number_range check (batch_number between 1 and 9),
  -- Dezelfde ronde twee keer inlezen is één ronde. Beiden mogen uploaden, dus
  -- dit gaat gebeuren.
  constraint print_batches_run_uq unique (run_date, batch_number),
  constraint print_batches_seen_complete
    check ((seen_at is null and seen_by is null) or (seen_at is not null and seen_by is not null))
);

create table print_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references print_batches(id),
  line_number integer not null,
  model text not null,
  language_code text not null default '',
  -- De taal zoals de app hem kent; leeg als de code onbekend is. Dat is geen
  -- reden om de regel te weigeren — Noviply print hem toch — maar wel om hem
  -- te markeren.
  layout text not null default '',
  variant text not null default '',
  quantity integer not null default 1,
  order_reference text not null default '',
  status text not null default 'open',
  note text not null default '',
  handled_at timestamptz,
  handled_by uuid references users(id),
  constraint print_batch_rows_status check (status in ('open', 'printed', 'not_printable')),
  constraint print_batch_rows_quantity check (quantity between 1 and 200),
  constraint print_batch_rows_model_not_blank check (length(btrim(model)) > 0),
  constraint print_batch_rows_line_uq unique (batch_id, line_number),
  -- Wie zegt dat iets niet te printen is, moet zeggen waarom.
  constraint print_batch_rows_reason_when_blocked
    check (status <> 'not_printable' or length(btrim(note)) >= 3),
  constraint print_batch_rows_handled_complete
    check (
      (status = 'open' and handled_at is null and handled_by is null)
      or (status <> 'open' and handled_at is not null and handled_by is not null)
    )
);

create index print_batch_rows_batch_idx on print_batch_rows (batch_id, line_number);
-- Waarop de wachtlijst zijn eigen orders terugvindt in een ronde.
create index print_batch_rows_order_idx on print_batch_rows (order_reference)
  where order_reference <> '';

comment on table print_batches is
  'De twee dagelijkse printrondes zoals ze uit het ordersysteem komen.';
comment on column print_batches.seen_at is
  'Wanneer Noviply de ronde heeft geopend; leeg betekent dat er nog een melding bij hoort.';
comment on column print_batch_rows.layout is
  'De taal zoals de app hem kent; leeg als de landcode uit het bestand onbekend is.';
