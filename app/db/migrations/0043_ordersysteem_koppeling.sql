-- Het ordersysteem levert de printronde voortaan zelf aan, via
-- /api/resync-export-noviply, in plaats van dat iemand een bestand uploadt.
--
-- Ook een machine handelt onder een naam. Zonder eigen account zou de ronde op
-- naam van een collega komen te staan die er niet bij was, en dan klopt de
-- geschiedenis niet meer — juist die geschiedenis is waar we een order in
-- terugzoeken. Vandaar een eigen gebruiker: in de lijst staat dan
-- "Ordersysteem", en dat is precies wat er gebeurd is.
--
-- Rol management, want daar zit `print.fulfil` in en de koppeling moet een
-- ronde kunnen aanmaken. Een eigen rol met alléén dat recht zou netter zijn,
-- maar dan komt er een vierde rol bij in elk scherm dat rollen toont; dat weegt
-- niet op tegen de winst zolang de sleutel alleen deze ene route opent.

insert into users (id, external_id, display_name, email)
values (
  '00000000-0000-0000-0000-000000000004',
  'rekey-ordersysteem',
  'Ordersysteem',
  'rekey-ordersysteem@local.invalid'
)
on conflict (id) do nothing;

insert into user_roles (user_id, role_code, assigned_by)
values (
  '00000000-0000-0000-0000-000000000004',
  'management',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (user_id, role_code) do nothing;
