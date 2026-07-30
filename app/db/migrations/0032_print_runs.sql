-- Twee vaste printrondes per dag. Een order die tussen twee rondes in wordt
-- besteld en klaargemaakt, komt vanzelf met de volgende ronde mee; daar hoort
-- geen aanvraag bij Noviply bij, want dan printen zij hetzelfde vel twee keer.
--
-- De tijden staan bij de rest van het beleid zodat management ze kan
-- verschuiven zonder dat er iemand aan de code hoeft te komen.

alter table operations_settings
  add column if not exists morning_run_at time not null default '09:00',
  add column if not exists afternoon_run_at time not null default '12:30';

comment on column operations_settings.morning_run_at is
  'Tijdstip van de eerste automatische printronde bij Noviply.';
comment on column operations_settings.afternoon_run_at is
  'Tijdstip van de tweede automatische printronde bij Noviply.';

-- De laptops die apart staan omdat hun vel met de volgende ronde meekomt.
-- Bewust naast print_requests en niet erin: dit is géén aanvraag bij Noviply,
-- en zij horen het dus ook niet te zien. Wordt het alsnog een aanvraag, dan
-- ontstaat daar een gewone print_request voor en verwijst deze regel ernaar.
create table print_run_waitlist (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  model text not null,
  layout text not null default '',
  variant text not null default '',
  order_reference text not null,
  expected_run_at timestamptz not null,
  expected_run_label text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  status text not null default 'waiting',
  settled_at timestamptz,
  settled_by uuid references users(id),
  print_request_id uuid references print_requests(id),
  constraint print_run_waitlist_status
    check (status in ('waiting', 'collected', 'escalated')),
  constraint print_run_waitlist_model_not_blank
    check (length(btrim(model)) > 0),
  -- Zonder ordernummer is de laptop straks niet terug te vinden op de kar.
  constraint print_run_waitlist_order_not_blank
    check (length(btrim(order_reference)) > 0),
  -- Afgehandeld betekent: bekend wanneer en door wie.
  constraint print_run_waitlist_settled_complete
    check (
      (status = 'waiting' and settled_at is null and settled_by is null)
      or (status <> 'waiting' and settled_at is not null and settled_by is not null)
    ),
  -- Alleen een doorgezette regel hoort naar een aanvraag te verwijzen.
  constraint print_run_waitlist_request_only_when_escalated
    check (status = 'escalated' or print_request_id is null)
);

-- Dezelfde order twee keer apart leggen voor dezelfde ronde is één laptop,
-- geen twee. Afgehandelde regels tellen niet mee: dezelfde order kan later
-- opnieuw langskomen.
create unique index print_run_waitlist_open_uq
  on print_run_waitlist (order_reference, expected_run_at)
  where status = 'waiting';

create index print_run_waitlist_open_idx
  on print_run_waitlist (expected_run_at)
  where status = 'waiting';

comment on table print_run_waitlist is
  'Laptops die apart staan tot hun vel met de eerstvolgende automatische printronde meekomt.';
