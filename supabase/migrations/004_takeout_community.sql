-- Pantry Network — Take-out, student page and Community (Steps 4-5).
-- Run in the Supabase SQL editor after 002_app.sql and 003_intake_reads_batch.sql.
-- Safe to re-run. Adds only columns/tables; nothing is dropped.
--
-- * ledger_entries.group_id   one take-out/removal = one feed entry (several rows)
-- * pickups.product_id        the offering campus's product, so a pending pickup
--                             keeps its units reserved until "Mark picked up"
-- * held_submissions.submission_id  makes a retried student submission idempotent
-- * student_submissions       when a random device cookie last had a take-out
--                             applied (repeat within 2 minutes is held). It
--                             stores NO name and NO IP, only the random id.
-- * count_checks              "Count looks off": a counted number to compare

alter table ledger_entries
  add column if not exists group_id uuid;
create index if not exists ledger_group
  on ledger_entries (group_id) where group_id is not null;

alter table pickups
  add column if not exists product_id uuid references products(id) on delete set null;

alter table held_submissions
  add column if not exists submission_id text;
create unique index if not exists held_campus_submission
  on held_submissions (campus_id, submission_id) where submission_id is not null;

create table if not exists student_submissions (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  device_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists student_submissions_device
  on student_submissions (campus_id, device_id, created_at desc);

create table if not exists count_checks (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  product_id uuid not null references products(id) on delete cascade,
  counted int not null check (counted >= 0),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists count_checks_campus on count_checks (campus_id, status);

-- RLS on; policies arrive with user accounts. The server uses the service-role key.
alter table student_submissions enable row level security;
alter table count_checks enable row level security;
