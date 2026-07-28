create type workfloor_trial_result as enum (
  'open',
  'passed',
  'failed'
);

create table workfloor_acceptance_trials (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  trial_reference text not null,
  location text not null,
  device_type text not null,
  device_name text not null,
  scanner_name text not null,
  participants integer not null,
  orders_tested integer not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  average_handling_seconds integer,
  methods jsonb not null,
  error_scenario_tested boolean not null,
  checks jsonb not null,
  result workfloor_trial_result not null,
  evidence_reference text not null default '',
  notes text,
  recorded_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint workfloor_trials_idempotency_uq unique (idempotency_key),
  constraint workfloor_trials_device_type
    check (device_type in ('desktop', 'tablet')),
  constraint workfloor_trials_participants
    check (participants between 1 and 50),
  constraint workfloor_trials_orders
    check (orders_tested between 0 and 500),
  constraint workfloor_trials_average
    check (
      average_handling_seconds is null
      or average_handling_seconds between 1 and 7200
    ),
  constraint workfloor_trials_timeline
    check (completed_at is null or completed_at > started_at),
  constraint workfloor_trials_json_objects
    check (
      jsonb_typeof(methods) = 'object'
      and jsonb_typeof(checks) = 'object'
    ),
  constraint workfloor_trials_passed_requirements
    check (
      result <> 'passed'
      or (
        completed_at is not null
        and average_handling_seconds is not null
        and orders_tested >= 5
        and error_scenario_tested
        and length(trim(evidence_reference)) >= 5
        and methods @> '{
          "loose_stickers": true,
          "noviply_sheet": true,
          "printed_sticker": true,
          "direct_reprint": true
        }'::jsonb
        and checks @> '{
          "orderScanWithoutMouse": true,
          "modelResolution": true,
          "hangingFileMatched": true,
          "keyboardGuideReadable": true,
          "deductionAfterVerification": true,
          "mismatchStopsDeduction": true
        }'::jsonb
      )
    ),
  constraint workfloor_trials_failed_requirements
    check (
      result <> 'failed'
      or (
        completed_at is not null
        and length(trim(coalesce(notes, ''))) >= 10
      )
    )
);

create index workfloor_trials_result_created_idx
  on workfloor_acceptance_trials (result, created_at desc);

comment on table workfloor_acceptance_trials is
  'Auditbare registratie van echte werkvloerproeven; een geslaagde proef keurt de formele go-livepoort niet automatisch goed.';
