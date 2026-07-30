-- De geschiedenis van Noviply wordt afgeleid uit de ingelezen rondes. Verdwijnt
-- een ronde, dan verdwijnen zijn regels uit de geschiedenis mee — en daarmee de
-- ordernummers en specificaties van werk dat wél is gedaan.
--
-- Een ronde mag uit de lijst kunnen, maar niet uit de administratie. Vandaar een
-- datum in plaats van een delete: de ronde verdwijnt uit "Print runs", de regels
-- blijven de geschiedenis vullen.

alter table print_batches
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references users(id);

alter table print_batches
  add constraint print_batches_deleted_complete
  check ((deleted_at is null and deleted_by is null) or (deleted_at is not null and deleted_by is not null));

create index if not exists print_batches_visible_idx
  on print_batches (run_date desc, batch_number desc)
  where deleted_at is null;

comment on column print_batches.deleted_at is
  'Uit de rondelijst gehaald. De regels blijven bestaan en blijven de geschiedenis vullen.';
