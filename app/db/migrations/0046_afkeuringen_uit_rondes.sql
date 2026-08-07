-- Wat Noviply in een printronde afkeurde, alsnog vastleggen.
--
-- Tot vandaag legde alleen een afgekeurde lósse aanvraag iets vast. Een regel
-- uit een ochtend- of middagronde die op "cannot print" ging, veranderde niets:
-- de werkvloer kreeg bij de volgende laptop van hetzelfde model gewoon weer de
-- premiumsticker aangeraden, Noviply zag het niet terug in hun eigen lijst, en
-- niemand kon het intrekken. De rondes zijn juist het grootste deel van het
-- werk — vandaar dat de lijst zo onvolledig aanvoelde.
--
-- De code doet dit nu bij het afhandelen zelf, met een reden die Noviply kiest.
-- Deze migratie haalt in wat er al lag. Daar is die reden er niet: die kolom
-- heeft nooit bestaan, er is alleen vrije tekst. Een reden verzinnen zou een
-- model kunnen uitsluiten dat Noviply gewoon kan printen.
--
-- Daarom alleen waar de tekst zelf zegt dat ze het niet hébben — "don't have
-- it", "we do not have this model" en varianten daarop. Dat is een blijvende
-- mededeling. "Folie op" of "printer stuk" is morgen voorbij en blijft dus
-- staan als geschiedenis, zonder blokkade.
--
-- Verder behoudend:
-- * alleen regels met een bekende taal, en de vastlegging geldt alleen voor
--   díe taal (layout_unknown). Iemand die "AZERTY BE" afkeurde heeft niets
--   gezegd over het Nederlandse toetsenbord van hetzelfde model;
-- * niet als dezelfde combinatie later alsnog geprint is — in een ronde of in
--   een losse aanvraag; dan werkt het aantoonbaar wel;
-- * niet als er al een openstaande vastlegging ligt, ook niet een modelbrede.
--
-- Elke regel is met één knop terug te draaien, door Noviply zelf of door
-- management.

insert into noviply_unavailable (
  model, model_key, layout, reason, note, recorded_at, recorded_by
)
select distinct on (lower(regexp_replace(trim(r.model), '[^a-zA-Z0-9]+', ' ', 'g')), lower(trim(r.layout)))
  trim(r.model),
  trim(both ' ' from lower(regexp_replace(trim(r.model), '[^a-zA-Z0-9]+', ' ', 'g'))),
  trim(r.layout),
  'layout_unknown',
  trim(r.note),
  coalesce(r.handled_at, now()),
  r.handled_by
from print_batch_rows r
where r.status = 'not_printable'
  and trim(r.layout) <> ''
  and r.handled_by is not null
  -- Alleen als de tekst zelf zegt dat ze het niet hebben. Al het andere blijft
  -- geschiedenis; daar valt geen blijvende uitspraak uit af te leiden.
  and regexp_replace(lower(trim(r.note)), '[^a-z ]', '', 'g') ~
    '(do not have|dont have|don t have|not have (this|it)|haven t got|hebben (wij |we )?niet)'
  -- Later alsnog geprint in een ronde? Dan is er niets aan de hand.
  and not exists (
    select 1 from print_batch_rows geprint
    where geprint.status = 'printed'
      and lower(regexp_replace(trim(geprint.model), '[^a-zA-Z0-9]+', ' ', 'g'))
        = lower(regexp_replace(trim(r.model), '[^a-zA-Z0-9]+', ' ', 'g'))
      and lower(trim(geprint.layout)) = lower(trim(r.layout))
      and geprint.handled_at > r.handled_at
  )
  -- Of alsnog geprint via een losse aanvraag; dat telt net zo goed.
  and not exists (
    select 1 from print_requests q
    where q.status = 'printed'
      and lower(regexp_replace(trim(q.model), '[^a-zA-Z0-9]+', ' ', 'g'))
        = lower(regexp_replace(trim(r.model), '[^a-zA-Z0-9]+', ' ', 'g'))
      and lower(trim(q.layout)) = lower(trim(r.layout))
      and q.handled_at > r.handled_at
  )
  -- Ligt er al iets, dan blijft dat staan; ook een modelbrede vastlegging.
  and not exists (
    select 1 from noviply_unavailable u
    where u.removed_at is null
      and u.model_key = trim(both ' ' from lower(regexp_replace(trim(r.model), '[^a-zA-Z0-9]+', ' ', 'g')))
      and (u.layout = '' or lower(trim(u.layout)) = lower(trim(r.layout)))
  )
order by
  lower(regexp_replace(trim(r.model), '[^a-zA-Z0-9]+', ' ', 'g')),
  lower(trim(r.layout)),
  r.handled_at desc
on conflict (model_key, layout) where removed_at is null do nothing;
