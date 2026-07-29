-- De bestellijst die Noviply nu nog in een pdf bijhoudt. Zolang die alleen in
-- de browser stond, zag Noviply op hun eigen computer niets van wat de
-- werkvloer aanvroeg. Daar is deze tabel voor.

create type print_request_status as enum (
  'requested',
  'printed',
  'not_printable'
);

create table print_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  brand text not null default '',
  model text not null,
  layout text not null default '',
  variant text not null default '',
  order_reference text not null default '',
  reason text not null default '',
  requested_at timestamptz not null default now(),
  requested_by uuid not null references users(id),
  status print_request_status not null default 'requested',
  handled_at timestamptz,
  handled_by uuid references users(id),
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint print_requests_idempotency_uq unique (idempotency_key),
  constraint print_requests_model_not_blank
    check (length(btrim(model)) > 0),
  -- Wie zegt dat iets niet te printen is, moet zeggen waarom: anders weet de
  -- werkvloer niet wat er dan wél moet gebeuren.
  constraint print_requests_reason_when_blocked
    check (status <> 'not_printable' or length(btrim(note)) >= 3),
  -- Afgehandeld betekent: bekend wanneer en door wie.
  constraint print_requests_handled_complete
    check (
      (status = 'requested' and handled_at is null and handled_by is null)
      or (status <> 'requested' and handled_at is not null and handled_by is not null)
    )
);

create index print_requests_open_idx
  on print_requests (requested_at)
  where status = 'requested';
