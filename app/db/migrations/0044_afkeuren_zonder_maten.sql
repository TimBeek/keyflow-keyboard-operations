-- Een pastest afkeuren zonder foto en zonder millimeters.
--
-- De tabel eiste een onderdeelnummer, een fotoreferentie en de maten van het
-- toetsenbord — bij elke beoordeling, ook bij een afkeuring. Dat is te streng
-- aan de verkeerde kant.
--
-- Bij goedkeuren horen die eisen: dan zeg je dat dit vel op alle volgende
-- laptops van dit model past, en dat is een uitspraak waar bewijs bij hoort dat
-- iemand kan nalopen.
--
-- Bij afkeuren is het bewijs al geleverd, en sterker dan een foto: iemand van de
-- werkvloer heeft het vel op de echte laptop gelegd en het paste niet. Er staan
-- ook een tijd, een naam en de reden bij. Die maten alsnog afdwingen betekent in
-- de praktijk dat een afkeuring nooit wordt vastgelegd — en dan blijft de app
-- dezelfde hangmap adviseren en komt dezelfde melding volgende week terug.
--
-- Vandaar: de maten mogen leeg zijn, maar alleen bij een afkeuring. Staat er wél
-- een maat, dan moet die nog steeds kloppen. Voor een goedkeuring verandert er
-- niets.

alter table compatibility_evidence
  alter column keyboard_width_mm drop not null,
  alter column keyboard_height_mm drop not null;

alter table compatibility_evidence
  drop constraint if exists compatibility_evidence_width_range,
  drop constraint if exists compatibility_evidence_height_range;

alter table compatibility_evidence
  add constraint compatibility_evidence_width_range
    check (keyboard_width_mm is null or keyboard_width_mm between 150 and 500),
  add constraint compatibility_evidence_height_range
    check (keyboard_height_mm is null or keyboard_height_mm between 50 and 250);

-- Een goedkeuring blijft alles nodig hebben. Dit staat nu in de database zelf,
-- zodat het ook geldt als er ooit een tweede weg naar deze tabel komt.
alter table compatibility_evidence
  add constraint compatibility_evidence_approved_is_documented
    check (
      status <> 'approved'
      or (
        keyboard_width_mm is not null
        and keyboard_height_mm is not null
        and length(btrim(manufacturer_part_number)) >= 3
        and length(btrim(photo_reference)) >= 3
      )
    );

comment on constraint compatibility_evidence_approved_is_documented
  on compatibility_evidence is
  'Goedkeuren vraagt foto, onderdeelnummer en maten; afkeuren niet — daar is de mislukte pastest zelf het bewijs.';
