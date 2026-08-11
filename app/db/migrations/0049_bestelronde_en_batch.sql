-- De bestelronde, de meelifttermijn en de ondergrens per regel.
--
-- Er werd elke week besteld, en dat leverde orders van rond de honderd vellen
-- over twintig regels. Voor een drukkerij is dat een opstelling per artikel voor
-- een handjevol vellen.
--
-- Doorgerekend op ons eigen verbruik, met de vraag onveranderd:
--   elke week    52 orders per jaar van   95 vellen
--   elke 2 weken 26 orders van  191 vellen
--   elke 4 weken 13 orders van  385 vellen
--   elke 6 weken  9 orders van  577 vellen
-- Het aandeel vraag dat misgrijpt blijft in alle gevallen rond een half procent;
-- wat verandert is de voorraad die je aanhoudt. Vier weken is de stand waarop de
-- voorraad op de bewegende hangmappen van ongeveer 480 naar 760 vellen gaat --
-- minder dan wat er nu al stilstaat.
--
-- De meelifttermijn is bewust kleiner dan de bestelronde. Zou hij daar overheen
-- gaan, dan tel je dezelfde vooruitblik twee keer en bestel je fors te veel.
--
-- De ondergrens geldt per artikel en niet als afronding op tientallen. Afronden
-- tilt ook de grote regels op die het niet nodig hebben en kost bij hetzelfde
-- effect ongeveer het dubbele aan voorraad.
--
-- Alle drie zijn instelbaar bij Instellingen; dit zijn beginwaarden.

alter table operations_settings
  add column if not exists order_cycle_days integer not null default 28,
  add column if not exists can_order_days integer not null default 10,
  add column if not exists min_line_quantity integer not null default 10;

alter table operations_settings
  drop constraint if exists operations_settings_order_cycle_check;
alter table operations_settings
  add constraint operations_settings_order_cycle_check
    check (order_cycle_days between 1 and 180
      and can_order_days between 0 and 90
      and min_line_quantity between 0 and 500);
