-- Twee dingen die de werkvloer en Noviply uit elkaar hielden.
--
-- 1. Meldde Noviply dat ze een model niet hebben, dan bleef dat in de
--    geschiedenis staan zonder het advies te veranderen. De volgende laptop van
--    hetzelfde model kreeg dus weer de premiumsticker aangeraden, en die
--    aanvraag werd weer afgewezen. Wat zij melden hoort de volgende keer mee te
--    tellen, dus leggen we het apart vast.
--
-- 2. Een toetsenbord met trackpoint (het rode knopje tussen G, H en B) heeft
--    een andere indeling dan hetzelfde model zonder. Noviply print het vel
--    zonder de laptop te zien, dus moeten ze dat weten voordat ze het maken.

alter table print_requests
  add column if not exists trackpoint text not null default 'unknown'
    check (trackpoint in ('yes', 'no', 'unknown'));

create table if not exists noviply_unavailable (
  id uuid primary key default gen_random_uuid(),
  -- Het model zoals de werkvloer het kiest, en genormaliseerd om op te zoeken.
  model text not null,
  model_key text not null,
  -- Leeg betekent: geen enkele taal. Anders geldt het alleen voor deze taal.
  layout text not null default '',
  reason text not null,
  note text not null default '',
  source_request_id uuid references print_requests (id) on delete set null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references users (id),
  -- Nemen ze het model later alsnog op, dan haalt management het hier weg.
  removed_at timestamptz,
  removed_by uuid references users (id)
);

-- Eén regel per model en taal zolang die geldt; opnieuw melden verandert de
-- bestaande regel in plaats van er een tweede naast te zetten.
create unique index if not exists noviply_unavailable_open_uq
  on noviply_unavailable (model_key, layout)
  where removed_at is null;

create index if not exists noviply_unavailable_lookup
  on noviply_unavailable (model_key)
  where removed_at is null;
