# Design — Pantry Network (full app)

Implements `requirements.md`. Builds the full manager + student app on the Phase-1
foundation (auth, vision, image, corrections, repository). The core architectural
shift from the prototype: **stock is derived from an append-only ledger**, not a
mutable `qty`; and **all logic lives in `src/lib`** with thin React components that
update in place (no whole-page re-render).

---

## 1. Architecture

```
 Browser
   Manager (desktop-first, sidebar) — behind PIN + session
     /inventory  /add  /takeout  /community  /settings  /help  /poster
   Student (phone-first, public)    — /s/[campusId]
   │ React components render state, call src/lib + API; update IN PLACE (PG.1)
   ▼
 Next.js API routes (server only)
   /api/session (reuse)       /api/vision/read-label (reuse, Step 3)
   /api/items (extend → batches + ledger)   /api/takeout   /api/community/*
   /api/inventory (derived read)            /api/campus (switch)
   ▼
 src/lib (headless, browser-free, tested)
   stock/      deriveStock(batches, ledger) → per-product on-shelf (PB.1/PB.2); FIFO
   status/     statusOf(product, today) → expired|out|soon|low|nodate|good (PB.3)
   inventory/  smart-card models, tab filters, search, row view-models (PD)
   intake/     (Step 3) review state machine + ReviewDraft (from intake-ui spec)
   takeout/    record-out model, fix/delete math, feed grouping, FIFO apply (PH)
   community/  matchChip/recommendations, offer/request/claim/pickup moves (PJ)
   device/     detectPhone({pointer, viewport, camera}) pure (PF.1/PO.8)
   labels/     COMMUNITY_LABEL and other renameable UI strings (PC.3)
   campus/     active-campus resolution + sample campuses (PB.5/PC.4)
   items/      ItemBatch + schema + computeArrivedExpired (reuse, extend)
   corrections/ correctionKey/diff/apply (reuse)   totals/ (reuse)
   expiry/     expiryStatus/chip (reuse)   dates/ (reuse)   taxonomy (reuse)
   vision/ image/ auth/ (reuse)
   db/         ItemRepository (extended) + Memory + Supabase + selector
   ▼
 Supabase (products, item_batches, ledger_entries, offers, requests, pickups,
           product_corrections, campuses) — RLS on; service-role key, server only
```

### Why a ledger (the key correctness decision)
The prototype mutates a single `qty` per item and loses the audit trail. "Stock is
calculated, not typed" (your rule) means the real model is: **intake batches add
stock; ledger entries (student take-outs, staff removals, fixes, recounts, Community
moves) adjust it.** On-shelf = sum(batch quantities) − sum(consuming ledger) for a
product, floored at 0, consumed oldest-first. This makes PO.1/PO.2/PO.6 provable and
makes "Fix"/"Undo"/recount honest. `deriveStock` is a pure function; the repository
just stores batches + ledger rows.

---

## 2. Core logic modules (`src/lib`)

### 2.1 `stock/` — derivation (PB.1/PB.2, PO.1/PO.2)
```ts
interface Batch { id: string; productKey: string; quantity: number;
  receivedOn: string; createdAt: string; expiresOn: string | null; }
interface Ledger { id: string; productKey: string; delta: number;  // negative = leaves shelf
  kind: "takeout"|"removal"|"fix"|"recount"|"community_out"|"community_in";
  at: string; }
function deriveOnShelf(batches: Batch[], ledger: Ledger[]): number; // ≥ 0
function consumeFIFO(batches: Batch[], qty: number): BatchConsumption[]; // oldest first
function lastRestockAmount(batches: Batch[]): number;  // most recent batch qty (PB.4)
```
All pure. `deriveOnShelf` sums batch quantities and applies ledger deltas, clamped at
0. `consumeFIFO` is used when recording take-outs/removals to attribute consumption
to the oldest batches (for expiry accuracy).

### 2.2 `status/` — status rules (PB.3, PO.3)
```ts
type Status = "expired"|"out"|"soon"|"low"|"nodate"|"good";
function statusOf(p: { onShelf: number; lastRestock: number; soonestDate: string|null;
  noExpire: boolean }, todayIso: string): Status;
```
Precedence exactly as the prototype: expired → out → soon(≤14d) → low(onShelf <
lastRestock/4) → nodate → good. `SOON_DAYS = 14`, `LOW_FRACTION = 1/4` as named
constants.

### 2.3 `device/` — phone detection (PF.1, PO.8)
```ts
function detectPhone(env: { coarsePointer: boolean; viewportWidth: number;
  hasCameraInput: boolean }): boolean;  // coarse && width<=820 && camera
```
Pure; the component passes `matchMedia("(pointer:coarse)")`, `innerWidth`, and the
result of `enumerateDevices()` (video input present). No UA sniffing. Add-stock reads
this to pick camera vs typed form; "Type it instead" is always available (PF.4).

### 2.4 `labels/` — renameable strings (PC.3)
```ts
export const COMMUNITY_LABEL = "Community";  // was "Share"; rename here only
```
Nav, titles, copy, and route-visible text import this.

### 2.5 `takeout/` (PH) and `community/` (PJ)
- `takeout/`: `buildRecordOut`, `applyFix(entry, newRows)` → stock deltas,
  `groupFeed(ledger)` → today's feed with student/staff split, **never** a name
  field. `recordOut` and student submits are idempotent by a client token (PI.5).
- `community/`: `recommend(active, offers, requests)` (ports `matchChip` ranking),
  `claim(offer, qty)` → pickup, `completePickup(pickup)` → two ledger moves
  (`community_out` on A, a new batch + `community_in` on B) conserving total (PO.6).

### 2.6 Reused modules
`intake/` (Step 3, from the intake-ui spec — review state machine, ReviewDraft),
`corrections/`, `totals/`, `expiry/`, `dates/`, `items/`, `vision/`, `image/`,
`auth/`, `taxonomy` — all already built or specced; extended, not rewritten.

---

## 3. Data model (Supabase, Step 1)

```sql
-- campuses (sample, invented)
campuses(id text pk, name text, region text, miles int, place text, hours text, contact text)

-- product identity per campus (normalized name+brand); stock is derived, not stored
products(id uuid pk, campus_id text, product_key text,  -- normalized name|brand
  name text, brand text, size_text text, category text, category_group text,
  unit text, no_expire boolean default false, source text,
  created_at timestamptz default now(), unique(campus_id, product_key))

-- intake batches add stock
item_batches(id uuid pk, campus_id text, product_id uuid references products(id),
  quantity int check (quantity between 1 and 999), received_on date,
  expires_on date, date_type text, date_precision text, date_source text,
  idempotency_key text, created_at timestamptz default now())
  -- partial unique (campus_id, idempotency_key)

-- append-only ledger: everything that changes stock after intake
ledger_entries(id uuid pk, campus_id text, product_id uuid references products(id),
  delta int,                              -- negative leaves the shelf
  kind text check (kind in ('takeout','removal','fix','recount','community_out','community_in')),
  source text check (source in ('student','staff','system')),  -- never a person name
  reason text, batch_id uuid, idempotency_key text, created_at timestamptz default now())
  -- NO name/person column by design (PH.2/PH.3/PO.5)

-- Community
offers(id uuid pk, campus_id text, product_id uuid, name text, unit text, qty int,
  expires_on date, no_expire boolean, category text, status text, note text, created_at timestamptz)
requests(id uuid pk, campus_id text, name text, category text, qty int, match_product_id uuid, offered int, created_at timestamptz)
pickups(id uuid pk, from_campus text, to_campus text, name text, unit text, qty int,
  category text, expires_on date, no_expire boolean, status text, created_at timestamptz)

-- product_corrections (reuse Phase-1)
product_corrections(... as built ...)

-- RLS enabled on all; policies arrive with user accounts.
```
`deriveOnShelf` runs over `item_batches` + `ledger_entries` for a product. The
repository exposes derived reads; the DB stores only facts.

---

## 4. Repository (`src/lib/db`, extend PM.2)
```ts
interface ItemRepository {
  name: "memory"|"supabase";
  // campuses
  listCampuses(): Promise<Campus[]>;
  // products + derived stock
  listInventory(campusId, todayIso): Promise<InventoryRow[]>;   // includes onShelf + status
  getProduct(campusId, productId): Promise<ProductDetail|null>;
  upsertProduct(campusId, input): Promise<Product>;
  // intake
  saveBatch(input): Promise<SaveResult>;                         // reuse Phase-1 shape
  // ledger
  recordLedger(entries: LedgerInput[]): Promise<void>;           // idempotent by key
  listFeed(campusId, since): Promise<FeedEntry[]>;               // today's take-out feed
  fixEntry / deleteEntry(...): Promise<void>;
  // corrections (reuse)
  getCorrection / saveCorrection(...)
  // community
  listOffers/myOffers/requests/pickups(...); createOffer/withdraw/createRequest(...);
  claimOffer(...): Promise<Pickup>; completePickup(...): Promise<void>; // two-sided move
}
```
Memory impl seeded from `data.js` (relative dates, PB.6); Supabase impl server-only
with the service-role key. Selector: Supabase when both env vars set, else Memory
(reuse `getRepository`).

---

## 5. API routes (server only)
- `POST /api/items` (extend): create product-if-needed + intake batch; returns batch
  + totals + remembered; records a `+` into derived stock. (Reuses Phase-1 wiring.)
- `GET /api/inventory?campus&today`: derived rows + smart-card models.
- `POST /api/takeout`: record-out / student submit (idempotent; FIFO; no name);
  `POST /api/takeout/fix`, `POST /api/takeout/delete`, `POST /api/takeout/recount`.
- `GET /api/takeout?since=today`: feed (student/staff, no names).
- `POST /api/community/offer|request|claim|pickup|withdraw`; `GET /api/community`.
- `POST /api/campus` (switch active campus → session cookie); `GET /api/campus`.
- Student routes are public (no session); manager routes require it (middleware
  extended to cover the new manager APIs; student + poster excluded).

All inputs zod-validated; all stock-changing ops idempotent (PM.4).

---

## 6. UI composition (`src/app`, `src/components`)
- Manager shell `<Sidebar>` (brand, `<CampusSwitcher>`, nav without Student page,
  Help/Settings) + `<main>`. Pages: `InventoryPage`, `AddStockPage`, `TakeoutPage`,
  `CommunityPage`, `SettingsPage`, `HelpPage`, `PosterPage`.
- Student: `/s/[campusId]` public, phone frame, cart, thank-you.
- Shared primitives: `SmartCard`, `StatusPill`, `StockBar`, `Chip`, `IconButton`
  (accessible name), `Stepper`, `Modal`, `Drawer`, `Toast`.
- **In-place updates (PG.1):** `Modal`/`Drawer` mount once when opened; internal
  state (stepper values, reason chips, tabs) lives in local React state and updates
  without remount. Open/close animates via CSS; value changes do not. This is the
  explicit fix for the prototype's modal-jump bug (PG.2).
- Icons via `lucide-react`; category icon names map to Lucide components.

---

## 7. Design tokens (Tailwind v4 `@theme`, PL.1)
Port `:root` from `design-reference/app/styles.css` verbatim:
```css
@theme {
  --color-bg:#f4f5f2; --color-surface:#fff; --color-ink:#111714; --color-muted:#5e6a63;
  --color-line:#e6e8e4; --color-line-2:#daddd5; --color-primary:#1a211d; --color-chip:#f1f3f0;
  --color-green:#1e7a46; --color-green-bg:#e7f5ec; --color-blue:#1d4e9b; --color-blue-bg:#e5eefb;
  --color-amber:#8a5a00; --color-amber-bg:#fff3db; --color-red:#b42318; --color-red-bg:#fde7e4;
  --color-bar-g:#2f9d5e; --color-bar-a:#e0a43a; --color-bar-r:#d64535;
  --radius-sm:8px; --radius:10px; --radius-lg:16px;
}
```
Font Figtree (next/font). Category bg/fg come from the `CATEGORIES` data map, not
tokens.

---

## 8. Config: exclude design-reference (PA.3)
- `tsconfig.json` `exclude`: add `design-reference`.
- ESLint flat config: add `design-reference/**` to `ignores`.
- `vitest.config.mts`: add `design-reference/**` to `exclude`.
- `next.config.ts`: already won't bundle it (outside `src`), but confirm no route
  globs reach it.

---

## 9. Test strategy (PO, mock only)
- `stock`: PO.1 (derived = ledger sum, never negative) + PO.2 (FIFO) via fast-check
  over random event sequences.
- `status`: PO.3 single-status + precedence property.
- `student list`: PO.4 no expired/out shown.
- `takeout`: PO.5 no name stored, ever; fix/delete re-derivation; idempotency.
- `community`: PO.6 claim→pickup conserves total, no negative.
- `device`: PO.8 detectPhone truth table.
- reuse: corrections (no dates), totals, expiry boundary.
- No snapshot/visual tests (PO.9).

---

## 10. Migration & reuse notes
- Phase-1 `items`/`intake_reads` become `item_batches`/ledger-aligned; add a new
  numbered migration (`002_app.sql`) rather than rewriting `001` (which you may have
  already run). The spec's tasks will reconcile the Phase-1 `/api/items` shape with
  the product+batch model so `/intake/test` keeps working during the transition.
- `/intake/today` (Phase-1) is superseded by the real Inventory/Take-out pages but
  kept until Step 2 lands.
```
