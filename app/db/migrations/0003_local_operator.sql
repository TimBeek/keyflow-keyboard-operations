insert into users (id, external_id, display_name, email)
values (
  '00000000-0000-0000-0000-000000000001',
  'keyflow-local-operator',
  'KeyFlow beheerder',
  'keyflow-beheerder@local.invalid'
)
on conflict (id) do nothing;
