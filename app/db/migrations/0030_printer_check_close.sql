-- Het antwoord "de printer staat klaar" bleef staan tot iemand opnieuw vroeg.
-- Maar zodra Noviply daadwerkelijk gaat printen is die vraag beantwoord én
-- afgehandeld: laten staan zou suggereren dat de printer nog steeds klaarstaat,
-- terwijl er ondertussen materiaal doorheen is gegaan.

alter table printer_checks
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references users(id);

alter table printer_checks
  add constraint printer_checks_close_complete
  check (
    (closed_at is null and closed_by is null)
    or (closed_at is not null and closed_by is not null and status <> 'pending')
  );
