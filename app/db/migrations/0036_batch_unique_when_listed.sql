-- Dezelfde ronde twee keer inlezen hoort één ronde te blijven. Maar sinds een
-- ronde uit de lijst kan worden gehaald, blokkeerde die regel ook het opnieuw
-- inlezen van een ronde die per ongeluk was verwijderd — en dan zit je vast.
--
-- De eis geldt daarom alleen nog voor rondes die in de lijst staan.

alter table print_batches drop constraint if exists print_batches_run_uq;

create unique index if not exists print_batches_run_uq
  on print_batches (run_date, batch_number)
  where deleted_at is null;
