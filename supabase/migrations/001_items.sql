-- Pantry Network — Module 1 (Intake) schema.
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: uses "if not exists" / "or replace" where possible.
--
-- Tables: items (one row per delivery batch), intake_reads (AI read audit, for
-- accuracy measurement), product_corrections (remembered fixes keyed by the
-- original AI read). RLS is enabled on all three; policies arrive with user
-- accounts in a later module. The app writes with the service-role key, which
-- bypasses RLS — the correct setup for this staff-only MVP.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- items: one row per saved delivery batch
-- ---------------------------------------------------------------------------
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null,
  idempotency_key text,
  name text not null,
  brand text,
  size_text text,
  category text,
  category_group text,
  quantity int not null check (quantity between 1 and 999),
  unit text default 'item',
  received_on date not null default current_date,
  expires_on date,
  date_type text,
  date_precision text check (date_precision in ('day','month')),
  date_source text check (date_source in ('photo','typed','imported','estimated')),
  dont_track boolean not null default false,
  doesnt_expire boolean not null default false,
  perishable boolean not null default false,
  arrived_expired boolean not null default false,
  source text check (source in ('donated','purchased')),
  edited_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Dedupe saves per campus by idempotency key. Partial so rows with a null key
-- never collide; only real keys are unique (drives UI13.3 / R11.10).
create unique index if not exists items_campus_idempotency_key
  on items (campus_id, idempotency_key)
  where idempotency_key is not null;

-- Fast "today's batches for a campus" lookups (GET /api/items?since=today).
create index if not exists items_campus_received_on
  on items (campus_id, received_on desc);

-- ---------------------------------------------------------------------------
-- intake_reads: the original AI read for each saved batch (accuracy audit)
-- ---------------------------------------------------------------------------
create table if not exists intake_reads (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items(id) on delete cascade,
  model text,
  read_name text,
  read_date_raw text,
  read_expires_on date,
  name_confidence numeric,
  date_confidence numeric,
  edited_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists intake_reads_item_id on intake_reads (item_id);

-- ---------------------------------------------------------------------------
-- product_corrections: remembered fixes keyed by the ORIGINAL AI read
-- (normalized read name + brand). Never stores dates.
-- ---------------------------------------------------------------------------
create table if not exists product_corrections (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null,
  read_key text not null,            -- normalized "name|brand" from the original read
  corrected_name text,
  corrected_brand text,
  corrected_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, read_key)       -- one correction per product per campus
);

-- ---------------------------------------------------------------------------
-- Row-level security on (policies come with user accounts in a later module).
-- The server uses the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------
alter table items enable row level security;
alter table intake_reads enable row level security;
alter table product_corrections enable row level security;
