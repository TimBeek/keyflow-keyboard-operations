-- "Rustig" erbij als werkdruk.
--
-- De werkdruk verschuift sinds vandaag de prijsgrens voor de toetsenbordsprint:
-- druk betekent een hogere grens en dus meer werk naar de andere methoden,
-- rustig een lagere grens en dus meer prints. Voor die tweede richting was er
-- nog geen stand — "normaal" was de laagste.
--
-- De check-constraint noemde de toegestane waarden met de hand, dus die moet
-- mee. Bestaande rijen staan op een waarde die er nog steeds in staat, dus er
-- verandert niets aan wat er nu is ingesteld.

alter table operations_settings
  drop constraint if exists operations_settings_workload_check;

alter table operations_settings
  add constraint operations_settings_workload_check
    check (workload in ('quiet', 'normal', 'busy', 'critical'));
