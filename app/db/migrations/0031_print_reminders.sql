-- Aanvragen die blijven liggen. De werkvloer ziet ze staan maar kan alleen
-- wachten; Noviply ziet een lijstje dat langzaam groeit zonder dat iemand zegt
-- dat het knelt. Eén knop lost dat op.
--
-- Bewust een aparte tabel en niet een vlag op de aanvraag: een herinnering gaat
-- over de hele wachtrij, niet over één sticker.

create table print_reminders (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  sent_by uuid not null references users(id),
  -- Hoeveel er op dat moment openstonden; dat maakt de urgentie concreet.
  open_count integer not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references users(id),
  constraint print_reminders_open_count_positive check (open_count > 0),
  constraint print_reminders_ack_complete
    check ((acknowledged_at is null) = (acknowledged_by is null))
);

-- Eén openstaande herinnering tegelijk: tien keer op de knop mag geen tien
-- pop-ups bij Noviply opleveren.
create unique index print_reminders_one_open_idx
  on print_reminders ((acknowledged_at is null))
  where acknowledged_at is null;
