-- Noviply is een partner, geen medewerker. Ze mogen de bestellijst afwerken en
-- de voorraad zien om te weten wat ze moeten nazenden, maar niets afboeken en
-- geen beleid raken.
--
-- De rechten volgen bewust de namen die de app al gebruikt (`print.fulfil`,
-- `conversion.execute`, `inventory.view`). Een tweede, eigen naamgeving voor
-- dezelfde handelingen zou vroeg of laat uiteenlopen met de code.

insert into roles (code, name, description)
values ('noviply', 'Noviply', 'Partner die stickers print en nalevert')
on conflict (code) do nothing;

insert into permissions (code, description)
values ('print.fulfil', 'Printaanvragen afvinken of onmogelijk melden')
on conflict (code) do nothing;

insert into role_permissions (role_code, permission_code)
values
  ('noviply', 'inventory.view'),
  ('noviply', 'print.fulfil'),
  ('management', 'print.fulfil')
on conflict (role_code, permission_code) do nothing;

insert into users (id, external_id, display_name, email)
values (
  '00000000-0000-0000-0000-000000000003',
  'keyflow-noviply',
  'Noviply',
  'keyflow-noviply@local.invalid'
)
on conflict (id) do nothing;

insert into user_roles (user_id, role_code, assigned_by)
values (
  '00000000-0000-0000-0000-000000000003',
  'noviply',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (user_id, role_code) do nothing;
