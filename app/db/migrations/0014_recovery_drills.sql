create type recovery_drill_result as enum ('passed', 'failed');

create table recovery_drills (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  backup_reference text not null,
  target_environment text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  rpo_minutes integer not null,
  rto_minutes integer not null,
  checks jsonb not null,
  result recovery_drill_result not null,
  notes text,
  performed_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint recovery_drills_idempotency_uq unique (idempotency_key),
  constraint recovery_drills_target_environment_valid
    check (target_environment in ('staging', 'recovery')),
  constraint recovery_drills_time_range_valid check (completed_at >= started_at),
  constraint recovery_drills_rpo_nonnegative check (rpo_minutes >= 0),
  constraint recovery_drills_rto_nonnegative check (rto_minutes >= 0),
  constraint recovery_drills_checks_object check (jsonb_typeof(checks) = 'object')
);

create index recovery_drills_completed_at_idx
  on recovery_drills (completed_at desc);

comment on table recovery_drills is
  'Bewijsregistratie van een buiten productie uitgevoerde herstelproef; deze tabel voert zelf geen providerback-up of restore uit.';

comment on column recovery_drills.backup_reference is
  'Herleidbare referentie van de gebruikte providerback-up of snapshot, zonder geheimen.';
