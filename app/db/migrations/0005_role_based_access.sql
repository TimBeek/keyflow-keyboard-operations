create table if not exists roles (
  code text primary key,
  name text not null,
  description text not null
);

create table if not exists permissions (
  code text primary key,
  description text not null
);

create table if not exists role_permissions (
  role_code text not null references roles(code) on delete cascade,
  permission_code text not null references permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_code text not null references roles(code) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references users(id),
  primary key (user_id, role_code)
);

insert into roles (code, name, description)
values
  ('management', 'Management', 'Volledig operationeel inzicht, planning, beleid en goedkeuring.'),
  ('employee', 'Werknemer', 'Uitvoering van conversies en dagelijkse voorraadhandelingen.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

insert into permissions (code, description)
values
  ('dashboard.management', 'Managementdashboard en KPI''s bekijken'),
  ('inventory.view', 'Voorraad en beschikbaarheid bekijken'),
  ('inventory.mutate', 'Voorraad ontvangen en afboeken'),
  ('conversion.execute', 'Conversieadvies gebruiken en uitvoering registreren'),
  ('imports.manage', 'Excel-imports uploaden, corrigeren en verwerken'),
  ('planning.view', 'Forecasting en besteladvies bekijken'),
  ('orders.approve', 'Bestellingen intern goedkeuren'),
  ('models.manage', 'Modelgroepen en compatibiliteit beheren'),
  ('reports.view', 'Managementrapportages bekijken'),
  ('users.manage', 'Gebruikers en rollen beheren'),
  ('policies.manage', 'Conversie- en voorraadbeleid beheren')
on conflict (code) do update set description = excluded.description;

insert into role_permissions (role_code, permission_code)
select 'management', code from permissions
on conflict do nothing;

insert into role_permissions (role_code, permission_code)
values
  ('employee', 'inventory.view'),
  ('employee', 'inventory.mutate'),
  ('employee', 'conversion.execute')
on conflict do nothing;

insert into users (id, external_id, display_name, email)
values (
  '00000000-0000-0000-0000-000000000002',
  'keyflow-local-employee',
  'KeyFlow werknemer',
  'keyflow-werknemer@local.invalid'
)
on conflict (id) do nothing;

insert into user_roles (user_id, role_code, assigned_by)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'management',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'employee',
    '00000000-0000-0000-0000-000000000001'
  )
on conflict do nothing;
