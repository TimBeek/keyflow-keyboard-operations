-- Eén ordernummer kan meerdere laptops zijn. Tot nu toe rekende alles met één
-- vel per handeling: de werkvloer moest dezelfde order dan drie keer door het
-- scherm halen, en Noviply zag drie losse aanvragen voor hetzelfde ordernummer
-- zonder te kunnen zien dat het er samen drie waren.
--
-- Eén blijft de standaard, want dat is verreweg het meest voorkomende geval.

alter table print_requests
  add column if not exists quantity integer not null default 1;

alter table print_run_waitlist
  add column if not exists quantity integer not null default 1;

alter table conversion_log
  add column if not exists quantity integer not null default 1;

-- Nul vellen aanvragen is geen aanvraag, en een order van duizend laptops is
-- een typefout. Dezelfde grens als in het scherm, zodat een verkeerd getal
-- hier stukloopt en niet stilletjes doorgaat.
alter table print_requests
  add constraint print_requests_quantity_range check (quantity between 1 and 200);
alter table print_run_waitlist
  add constraint print_run_waitlist_quantity_range check (quantity between 1 and 200);
alter table conversion_log
  add constraint conversion_log_quantity_range check (quantity between 1 and 200);

comment on column print_requests.quantity is
  'Aantal vellen voor deze order; één order kan meerdere laptops bevatten.';
comment on column conversion_log.quantity is
  'Aantal laptops dat met deze handeling is omgezet.';
