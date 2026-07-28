do $$ begin
  create type model_group_proposal_status as enum (
    'pending',
    'approved',
    'rejected',
    'superseded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type model_group_review_decision as enum (
    'approved',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

create table if not exists model_group_proposals (
  id uuid primary key default gen_random_uuid(),
  suggestion_key text not null,
  proposed_name text not null,
  manufacturer text not null,
  sku_id uuid references sticker_skus(id),
  layout_id uuid references keyboard_layouts(id),
  variant_code text,
  candidate_models jsonb not null,
  source_evidence jsonb not null,
  risk_flags jsonb not null,
  confidence integer not null,
  source text not null default 'catalog_assistant',
  status model_group_proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_group_proposals_confidence_range
    check (confidence between 0 and 100)
);

create unique index if not exists model_group_proposals_suggestion_key_uq
  on model_group_proposals (suggestion_key);

create table if not exists model_group_reviews (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references model_group_proposals(id),
  idempotency_key text not null,
  decision model_group_review_decision not null,
  manufacturer_part_number text,
  photo_reference text,
  evidence jsonb not null,
  notes text,
  reviewed_by uuid not null references users(id),
  reviewed_at timestamptz not null default now()
);

create index if not exists model_group_reviews_proposal_time_idx
  on model_group_reviews (proposal_id, reviewed_at desc);

create unique index if not exists model_group_reviews_idempotency_key_uq
  on model_group_reviews (idempotency_key);

comment on table model_group_proposals is
  'Herleidbare modelgroepvoorstellen. Een voorstel is nooit zelfstandig compatibiliteitsbewijs.';

comment on table model_group_reviews is
  'Menselijke goedkeuring of afwijzing met E1/E2-, onderdeelnummer-, foto- en droge-pastestbewijs.';
