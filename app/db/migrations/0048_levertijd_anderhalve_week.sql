-- De levertijd van Noviply op anderhalve week.
--
-- Er stond veertien dagen. Dat was ooit gekozen als "de langste van zeven tot
-- veertien", maar Noviply geeft zelf ongeveer anderhalve week op. Dat verschil
-- is niet academisch: het schuift elk bestelpunt en elk bestelaantal op, en het
-- staat sinds vandaag ook letterlijk op hun eigen scherm.
--
-- Alleen waar de waarde nog op de oude standaard staat. Heeft management hem
-- ooit zelf bijgesteld, dan is dat een besluit en geen instelling die is blijven
-- staan; die overschrijven zou dat besluit stilzwijgend terugdraaien.
--
-- Het veld is en blijft instelbaar bij Instellingen. Zodra er echte leveringen
-- zijn doorgemeten hoort dit getal daarop te volgen; nu is het nog een opgave
-- van de leverancier en geen waarneming.

update operations_settings
set resupply_lead_time_days = 11,
    version = version + 1,
    updated_at = now()
where resupply_lead_time_days = 14;
