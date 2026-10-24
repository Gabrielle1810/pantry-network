-- Pantry Network — full app schema (Step 1). Run this in the Supabase SQL editor
-- AFTER 001_items.sql. Introduces the products + batches + append-only ledger
-- model (stock is derived, never a stored mutable number), plus campuses,
-- Community (offers/requests/pickups), and student held-submissions.
--
-- Design notes enforced here:
--  * ledger_entries has NO person/name column by design (no-names rule, PH.2/PO.5).
--  * stock is derived from item_batches + ledger_entries; there is no qty column.
--  * campuses.student_token is an unguessable token for the public student URL (PI.1).
--  * RLS is enabled on every table; policies arrive with user accounts. The server
--    uses the service-role key, which bypasses RLS (correct for this staff MVP).
--
-- Safe to re-run: uses "if not exists" / "or replace" throughout.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- campuses (sample, invented). student_token gates the public student page.
-- ---------------------------------------------------------------------------
create table if not exists campuses (
  id text primary key,
  name text not null,
  region text,
  miles int not null default 0,
  place text,
  hours text,
  contact text,
  live boolean not null default false,
  student_token text unique not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- products: one identity per (campus, normalized name|brand). No qty here —
-- on-shelf is derived from batches + ledger.
-- ---------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  product_key text not null,            -- normalized "name|brand"
  name text not null,
  brand text,
  size_text text,
  category text,
  category_group text,
  unit text default 'item',
  no_expire boolean not null default false,
  source text check (source in ('donated','purchased')),
  created_at timestamptz not null default now(),
  unique (campus_id, product_key)
);

-- ---------------------------------------------------------------------------
-- item_batches: intake adds stock. Each batch is a positive contribution.
-- ---------------------------------------------------------------------------
create table if not exists item_batches (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null check (quantity between 1 and 999),
  received_on date not null default current_date,
  expires_on date,
  date_type text,
  date_precision text check (date_precision in ('day','month')),
  date_source text check (date_source in ('photo','typed','imported','estimated')),
  idempotency_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists item_batches_campus_idem
  on item_batches (campus_id, idempotency_key) where idempotency_key is not null;
create index if not exists item_batches_product on item_batches (product_id, received_on);

-- ---------------------------------------------------------------------------
-- ledger_entries: append-only. Everything that changes stock after intake.
-- delta < 0 leaves the shelf. NO person/name column (PH.2/PO.5).
-- ---------------------------------------------------------------------------
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  product_id uuid not null references products(id) on delete cascade,
  delta int not null,
  kind text not null check (kind in ('takeout','removal','fix','recount','community_out','community_in')),
  source text not null check (source in ('student','staff','system')),
  reason text,
  batch_id uuid references item_batches(id) on delete set null,
  idempotency_key text,
  created_at timestamptz not null default now()
);
create unique index if not exists ledger_campus_idem
  on ledger_entries (campus_id, idempotency_key) where idempotency_key is not null;
create index if not exists ledger_product on ledger_entries (product_id, created_at);

-- ---------------------------------------------------------------------------
-- Community: offers (with reservation), requests, pickups.
-- A reservation is represented by an open offer; stock leaves only at pickup.
-- ---------------------------------------------------------------------------
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  product_id uuid references products(id) on delete set null,
  name text not null,
  unit text,
  qty int not null check (qty >= 0),
  category text,
  expires_on date,
  no_expire boolean not null default false,
  status text not null default 'open' check (status in ('open','claimed','withdrawn','completed')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists offers_campus_status on offers (campus_id, status);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  name text not null,
  category text,
  qty int not null check (qty >= 0),
  match_product_id uuid references products(id) on delete set null,
  offered int,
  created_at timestamptz not null default now()
);

create table if not exists pickups (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references offers(id) on delete set null,
  from_campus text not null references campuses(id),
  to_campus text not null references campuses(id),
  name text not null,
  unit text,
  qty int not null check (qty > 0),
  category text,
  expires_on date,
  no_expire boolean not null default false,
  status text not null default 'pending' check (status in ('pending','completed')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- held_submissions: student repeat-within-2-minutes submissions held for staff
-- review (no stock change until accepted). Device identified only by a random
-- cookie id — never a name or IP (PI.6).
-- ---------------------------------------------------------------------------
create table if not exists held_submissions (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null references campuses(id),
  device_id text not null,
  lines jsonb not null,                 -- [{ product_id, qty }]
  status text not null default 'held' check (status in ('held','accepted','discarded')),
  created_at timestamptz not null default now()
);
create index if not exists held_campus_status on held_submissions (campus_id, status);

-- ---------------------------------------------------------------------------
-- RLS on all new tables. Policies arrive with user accounts (future module).
-- ---------------------------------------------------------------------------
alter table campuses          enable row level security;
alter table products          enable row level security;
alter table item_batches      enable row level security;
alter table ledger_entries    enable row level security;
alter table offers            enable row level security;
alter table requests          enable row level security;
alter table pickups           enable row level security;
alter table held_submissions  enable row level security;
