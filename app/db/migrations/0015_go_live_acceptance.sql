create type go_live_acceptance_gate as enum (
  'database_recovery',
  'identity_access',
  'order_integration',
  'compatibility_evidence',
  'workfloor_acceptance'
);

create type go_live_acceptance_decision as enum (
  'pending',
  'approved',
  'rejected'
);

create table go_live_acceptance_records (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  gate go_live_acceptance_gate not null,
  owner_name text not null,
  evidence_reference text not null default '',
  evidence_date timestamptz,
  checks jsonb not null,
  decision go_live_acceptance_decision not null,
  notes text,
  reviewed_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  constraint go_live_acceptance_idempotency_uq unique (idempotency_key),
  constraint go_live_acceptance_owner_name
    check (length(trim(owner_name)) >= 2),
  constraint go_live_acceptance_checks_object
    check (jsonb_typeof(checks) = 'object'),
  constraint go_live_acceptance_approval_requirements
    check (
      decision <> 'approved'
      or (
        length(trim(evidence_reference)) >= 5
        and evidence_date is not null
        and checks @> '{
          "scopeConfirmed": true,
          "testCompleted": true,
          "evidenceAttached": true,
          "ownerApproved": true
        }'::jsonb
      )
    ),
  constraint go_live_acceptance_rejection_notes
    check (
      decision <> 'rejected'
      or length(trim(coalesce(notes, ''))) >= 10
    )
);

create index go_live_acceptance_gate_created_idx
  on go_live_acceptance_records (gate, created_at desc);

comment on table go_live_acceptance_records is
  'Auditbaar managementdossier voor externe go-livebewijzen; een record voert zelf geen externe test of goedkeuring uit.';
