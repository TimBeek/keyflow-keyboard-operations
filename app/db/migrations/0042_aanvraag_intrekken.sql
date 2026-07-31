-- Een medewerker die zich verkijkt op het model, de taal of de entervorm kon de
-- aanvraag niet meer tegenhouden. Noviply printte hem dan gewoon, en er lag een
-- vel dat nergens op paste.
--
-- "Intrekken" is bewust een eigen status en geen verwijdering: de aanvraag heeft
-- bestaan, en in de geschiedenis moet terug te vinden zijn dat hij is
-- teruggetrokken en door wie. Alleen wat nog niet is afgehandeld kan weg; is er
-- al geprint, dan is intrekken zinloos en moet het gesprek over de kosten gaan.

alter type print_request_status add value if not exists 'cancelled';
