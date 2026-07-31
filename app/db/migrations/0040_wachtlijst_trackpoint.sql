-- Een laptop die apart gaat voor de volgende printronde kan er na die ronde
-- alsnog niet bij liggen. Dan wordt hij een gewone printaanvraag bij Noviply —
-- maar het antwoord op de trackpointvraag ging niet mee, dus zagen zij daar
-- "niet opgegeven" staan terwijl de medewerker het wél had ingevuld.

alter table print_run_waitlist
  add column if not exists trackpoint text not null default 'unknown'
    check (trackpoint in ('yes', 'no', 'unknown'));
