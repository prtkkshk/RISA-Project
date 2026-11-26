-- RISA Sponsor Growth Center schema
-- Source tables keep the original rows exactly as supplied, INCLUDING import-retry duplicates.
-- De-duplication and "latest version as of date" logic happen in the metrics engine (lib/engine.ts),
-- so the original data stays available for testing. _row preserves load order; _origin marks
-- whether a row came from the source pack ('source') or was written by the app ('app').

drop table if exists pending_actions, chat_messages, audit_log, kpi_readings, tasks, payments, initiatives, app_settings,
  sponsor_activations, opportunity_history, partner_opportunities, brand_qualification_history,
  sponsor_interactions, sponsor_campaigns, sponsor_contacts, brands, targets, event cascade;

create table event (
  event_name text, history_start date, history_end date,
  event_starts_at timestamptz, event_ends_at timestamptz,
  timezone text, currency text, fictional boolean
);

create table targets (
  _row bigserial primary key, _origin text not null default 'source',
  effective_at timestamptz not null, qualified_brands_goal int not null,
  confirmed_partnerships_goal int not null, target_version text not null,
  recorded_at timestamptz not null default now()
);

create table brands (
  _row bigserial primary key, _origin text not null default 'source',
  brand_name text not null, industry text, owner_name text, created_at timestamptz,
  brand_id text not null, owner_id text
);

create table sponsor_contacts (
  _row bigserial primary key, _origin text not null default 'source',
  contact_name text, job_title text, brand_name text, created_at timestamptz,
  contact_id text not null, brand_id text not null
);

create table sponsor_campaigns (
  _row bigserial primary key, _origin text not null default 'source',
  campaign_name text, channel text, objective text, audience text, owner_name text,
  planned_start_at timestamptz, planned_end_at timestamptz, created_at timestamptz,
  sponsor_campaign_id text not null, owner_id text
);

create table sponsor_interactions (
  _row bigserial primary key, _origin text not null default 'source',
  brand_name text, contact_name text, campaign_name text, channel text, event_type text,
  outcome text, summary text, occurred_at timestamptz, interaction_id text not null,
  attempt_id text, origin_interaction_id text, brand_id text, contact_id text,
  sponsor_campaign_id text, owner_id text
);

create table brand_qualification_history (
  _row bigserial primary key, _origin text not null default 'source',
  brand_name text, qualification_status text not null, reason text, source_campaign_name text,
  effective_at timestamptz not null, history_id text not null, brand_id text not null,
  sponsor_campaign_id text, recorded_at timestamptz not null default now()
);

create table partner_opportunities (
  _row bigserial primary key, _origin text not null default 'source',
  opportunity_name text, brand_name text, primary_contact_name text, originating_campaign_name text,
  support_type text, created_at timestamptz, opportunity_id text not null, brand_id text not null,
  primary_contact_id text, sponsor_campaign_id text
);

create table opportunity_history (
  _row bigserial primary key, _origin text not null default 'source',
  opportunity_name text, brand_name text, stage text not null, proposed_value_inr bigint,
  confirmed_value_inr bigint, owner_name text, effective_at timestamptz not null,
  history_id text not null, opportunity_id text not null, brand_id text, owner_id text,
  recorded_at timestamptz not null default now()
);

create table sponsor_activations (
  _row bigserial primary key, _origin text not null default 'source',
  brand_name text, opportunity_name text, attendee_campaign_name text, activation_note text,
  linked_at timestamptz, activation_id text not null, brand_id text, opportunity_id text,
  attendee_campaign_id text
);

-- ---------- App (management) tables ----------
create table app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());

create table initiatives (
  id bigserial primary key, rank int, name text not null, concept text, status text not null default 'planned',
  owner_name text, budget_inr bigint default 0, spent_inr bigint default 0,
  start_date date, end_date date, expected_cash_inr bigint default 0,
  kpi_name text, kpi_unit text, direction text not null default 'higher_is_better',
  scale_threshold numeric, stop_threshold numeric, decision_rule text,
  is_simulated boolean not null default true, updated_at timestamptz not null default now()
);

create table kpi_readings (
  id bigserial primary key, initiative_id bigint references initiatives(id) on delete cascade,
  reading_date date not null, value numeric not null, note text,
  is_simulated boolean not null default true, created_at timestamptz not null default now()
);

create table tasks (
  id bigserial primary key, title text not null, description text, owner_name text, due_date date,
  status text not null default 'todo', priority text not null default 'medium',
  initiative_id bigint references initiatives(id) on delete set null,
  opportunity_id text, brand_id text, created_by text not null default 'user',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table payments (
  id bigserial primary key, opportunity_id text not null, kind text not null check (kind in ('invoice','receipt')),
  amount_inr bigint not null, event_date date not null, due_date date, note text,
  is_simulated boolean not null default true, created_by text not null default 'seed',
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key, at timestamptz not null default now(), actor text not null,
  action text not null, entity text, entity_id text, detail jsonb
);

create table chat_messages (
  id bigserial primary key, conversation_id text not null, role text not null, content text,
  meta jsonb, created_at timestamptz not null default now()
);

create table pending_actions (
  id bigserial primary key, conversation_id text, action_type text not null, payload jsonb not null,
  summary text, rationale text, status text not null default 'pending',
  created_at timestamptz not null default now(), resolved_at timestamptz
);

create index on sponsor_interactions(brand_id);
create index on opportunity_history(opportunity_id);
create index on brand_qualification_history(brand_id);
