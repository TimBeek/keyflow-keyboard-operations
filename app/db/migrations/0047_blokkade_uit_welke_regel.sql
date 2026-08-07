-- Onthouden uit welke rondesregel een blokkade komt.
--
-- Sinds vandaag legt een afgehandelde regel uit een printronde dezelfde
-- blokkade vast als een losse aanvraag. Maar op zo'n regel zit ook een
-- Undo-knop, voor de verkeerde klik met een handschoen aan op een klein
-- scherm. Die zette de regel wel terug op open en liet de blokkade staan: het
-- model bleef dan uitgesloten voor de werkvloer terwijl er niets meer aan de
-- hand was, en alleen wie het Noviply-tabblad opende kon dat nog vinden.
--
-- Met deze verwijzing weet de app welke blokkade bij welke klik hoort, en kan
-- Undo precies die ene intrekken — niet meer, en niet die van iemand anders.
--
-- Bestaande rijen krijgen null; die zijn niet uit een ronde ontstaan, of van
-- vóór deze wijziging.

alter table noviply_unavailable
  add column if not exists source_batch_row_id uuid
    references print_batch_rows (id) on delete set null;

create index if not exists noviply_unavailable_source_row_idx
  on noviply_unavailable (source_batch_row_id)
  where source_batch_row_id is not null;
