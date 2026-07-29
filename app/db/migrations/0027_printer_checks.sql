-- De printer voor de premiumstickers staat bij ons, maar Noviply bedient hem op
-- afstand. Ze kunnen dus niet zien of er papier in zit, of hij aan staat, of er
-- iemand bij is. Vroeger was dat een telefoontje; nu een vraag in het scherm.
--
-- De vraag hoort bij de werkvloer als geheel, niet bij één persoon: wie er
-- langsloopt kan antwoorden.

create type printer_check_status as enum (
  'pending',
  'ready',
  'blocked'
);

create table printer_checks (
  id uuid primary key default gen_random_uuid(),
  asked_at timestamptz not null default now(),
  asked_by uuid not null references users(id),
  question text not null default '',
  status printer_check_status not null default 'pending',
  answered_at timestamptz,
  answered_by uuid references users(id),
  answer_note text not null default '',
  -- Wie zegt dat de printer niet klaarstaat moet zeggen waarom, anders weet
  -- Noviply niet of ze over vijf minuten of over een dag kunnen printen.
  constraint printer_checks_reason_when_blocked
    check (status <> 'blocked' or length(btrim(answer_note)) >= 3),
  constraint printer_checks_answer_complete
    check (
      (status = 'pending' and answered_at is null and answered_by is null)
      or (status <> 'pending' and answered_at is not null and answered_by is not null)
    )
);

-- Er hoort er hooguit één open te staan: twee tegelijk zou de werkvloer twee
-- pop-ups geven over dezelfde printer.
create unique index printer_checks_one_open_idx
  on printer_checks ((status = 'pending'))
  where status = 'pending';

create index printer_checks_recent_idx on printer_checks (asked_at desc);
