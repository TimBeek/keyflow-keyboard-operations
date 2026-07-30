-- Als er iets stukgaat komt niemand daar achter tot iemand belt. Onverwachte
-- fouten gingen naar de console van de server, en die leest niemand.
--
-- Bewust geen externe dienst: dan hangt er een account, een abonnement en een
-- derde partij aan vast voor iets wat hier gewoon een tabel kan zijn. En omdat
-- het een tabel is, kan het in het scherm van management staan naast de andere
-- dingen waar iemand iets mee moet.

create table error_events (
  id uuid primary key default gen_random_uuid(),
  -- 'server' voor een API-route, 'browser' voor een scherm dat omvalt.
  source text not null,
  -- De route of het scherm waar het gebeurde.
  origin text not null default '',
  message text not null,
  -- De eerste regels van de stack; genoeg om te zoeken, niet zo veel dat het
  -- een dump wordt.
  detail text not null default '',
  role text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Eén fout die honderd keer optreedt is één probleem, geen honderd regels.
  occurrences integer not null default 1,
  -- Afgehandeld door management; blijft staan als bewijs dat het er was.
  resolved_at timestamptz,
  resolved_by uuid references users(id),
  constraint error_events_source check (source in ('server', 'browser')),
  constraint error_events_message_not_blank check (length(btrim(message)) > 0),
  constraint error_events_resolved_complete
    check ((resolved_at is null and resolved_by is null)
        or (resolved_at is not null and resolved_by is not null))
);

-- Dezelfde fout op dezelfde plek is dezelfde fout: die wordt opgeteld in plaats
-- van herhaald.
create unique index error_events_same_idx
  on error_events (source, origin, message)
  where resolved_at is null;

create index error_events_open_idx
  on error_events (last_seen_at desc)
  where resolved_at is null;

comment on table error_events is
  'Onverwachte fouten uit de server en uit de browser, samengevoegd per plek en melding.';
