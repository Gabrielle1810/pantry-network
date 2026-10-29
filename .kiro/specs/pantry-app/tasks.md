# Tasks — Pantry Network (full app)

Logic-first: `src/lib` + tests land before the components that render them, so the
UI stays thin and deletable (PA.1). Mock vision only; no test hits the network
(PO). Each task lists the requirements it covers. 🔴 required · 🟡 cuttable ·
🔐 needs your login/cost (none expected — Supabase + Vercel are already connected).

> Supersedes the open `intake-ui` plan: its four screens are folded into Step 3.
> Reuses Phase-1 (auth, vision, image, corrections, repository, items, totals,
> expiry, dates). `design-reference/` stays as docs, excluded from build/TS/lint/test.

---

## Step 0 — Groundwork

### Task 0.1 — Exclude design-reference; add deps 🔴 ✅
- tsconfig `exclude`, ESLint ignore, vitest `exclude` for `design-reference/**` (PA.3).
- Add `lucide-react`; wire Figtree via `next/font`. Port `:root` tokens into
  `globals.css` `@theme` (PL.1).
- **Tests:** build/lint/test still green with design-reference ignored.
- **Reqs:** PA.3, PL.1.

### Task 0.2 — Shared pure logic: stock, status, device, labels, campus 🔴 ✅
- `src/lib/stock` (`deriveOnShelf`, `consumeFIFO`, `lastRestockAmount`),
  `src/lib/status` (`statusOf` + constants), `src/lib/device` (`detectPhone`),
  `src/lib/labels` (`COMMUNITY_LABEL`), `src/lib/campus` (sample campuses + active
  resolution).
- **Tests (PO.1/2/3/8):** derived stock never negative + FIFO (fast-check); status
  precedence; detectPhone truth table.
- **Reqs:** PB.1–PB.4, PC.3, PC.4, PF.1.

---

## Step 1 — Data layer + Supabase 🔴

### Task 1.1 — Schema migration `002_app.sql` (not executed) 🔴 ✅
- `campuses` (incl. `student_token` unguessable, PI.1), `products`, `item_batches`,
  `ledger_entries` (kinds incl. `recount`/`community_out`/`community_in`; **no**
  person/name column, PH.2/PO.5), `offers` (with reserved semantics), `requests`,
  `pickups`, `held_submissions` (student holds for review, PI.6); keep
  `product_corrections`; indexes; RLS enabled; policies-later note. Give you the SQL.
- **Reqs:** PM.1, PB.8, PD.9a, PI.1, PI.6.

### Task 1.2 — Repository extension (Memory + Supabase) 🔴 ✅
- Extend `ItemRepository` (§4): campuses, derived inventory (on-shelf **and**
  reserved), products, batches, ledger, feed, offers/requests/pickups, held
  submissions, corrections. MemoryRepository seeded for **two live campuses**:
  `harbor` = full `data.js` inventory, `cedar` = ~10–12 invented items; the other
  four campuses exist only as Community offers/requests. Seed batches + ledger so
  derived on-shelf == `data.js` `qty` and last-restock == most recent batch (numbers
  match the prototype on load, decision #2). **Relative dates** (PB.6).
  SupabaseRepository server-only (`SUPABASE_URL` + `SERVICE_ROLE_KEY`, never
  NEXT_PUBLIC_*); selector by env.
- `deriveOnShelf` + reservation accounting used for reads; stock stored only as
  batches + ledger (PM.3); reservations derived from open offers (PD.9a).
- **Tests:** two-campus seed → derived stock matches data.js; save batch → stock +;
  ledger take-out → stock −, FIFO; idempotent ledger; corrections round-trip;
  Supabase selected only when both env vars set (client stubbed).
- **Reqs:** PM.2–PM.4, PB.1/2/8, PD.9a, decision #1/#2.

### Task 1.3 — API: inventory read + campus switch 🔴 ✅
- `GET /api/inventory` (derived rows + smart-card models), `GET/POST /api/campus`
  (active campus in session cookie). Extend middleware for new manager APIs; keep
  student/poster public.
- **Tests:** inventory read returns derived onShelf + status; campus switch scopes
  data.
- **Reqs:** PA.4, PC.4, PD.1.

---

## Step 2 — App shell + Inventory 🔴

### Task 2.1 — Manager shell + campus switcher + design primitives 🔴 ✅
- `<Sidebar>` (brand, `<CampusSwitcher>`, nav: Inventory/Add stock/Take-out/
  Community; footer: Help/Settings) — **no Student page link** (PC.2). `SmartCard`,
  `StatusPill`, `StockBar`, `Chip`, `IconButton`, `Stepper`, `Modal`, `Drawer`,
  `Toast` — modal/drawer mount-once + in-place updates (PG.1).
- **Tests:** none (UI); in-place behavior covered by lib + a focused interaction note.
- **Reqs:** PC.1–PC.5, PG.1, PL.2–PL.4.

### Task 2.2 — Inventory smart cards + model 🔴 ✅
- `src/lib/inventory` smart-card models (running low / soon / expired / this period),
  tab filters, search, row view-models. `/inventory` renders them.
- **Tests:** card models + tab counts + search filter (pure).
- **Reqs:** PD.1–PD.6.

### Task 2.3 — Inventory edit drawer + Full sheet + remove flow 🔴 ✅ (built in Step 7; selection bar reuses the Take-out remove flow and the Community offer modal)
- Edit drawer + Full-sheet cell edits: editing on-shelf writes an "Edited by staff"
  adjustment entry, never an overwrite (fix B, PD.7a/PD.10). Selection bar; remove
  flow (reasons, FIFO reduce, ledger, 10s Undo). "Moved to Community" creates an open
  offer + **reservation** and makes **no** stock change (fix A, PD.9a).
- **Tests (PO.6b):** edit-on-shelf → adjustment entry equals the diff, batches
  unchanged; remove math (FIFO, never negative); undo restores; "moved to community"
  reserves without subtracting.
- **Reqs:** PD.7–PD.10, PD.7a, PD.9a, PG.1.

---

## Step 3 — Add stock (phone camera + desktop typed) 🔴

### Task 3.1 — Intake review state machine + ReviewDraft (from intake-ui) 🔴 ✅
- Port the intake-ui `src/lib/intake` (review states, buildDraft, savable,
  computeEditedFields, applyDateOnlyRead, unit/pluralize) onto the product+batch
  model.
- **Tests:** never `saving` without confirm; no unresolved-ambiguous save;
  dont_track/doesnt_expire ⇒ null; remembered fix prefilled not counted as edit.
- **Reqs:** PE.2, PE.3.

### Task 3.2 — Phone camera flow UI 🔴 ✅
- `/add` on phone: viewfinder (getUserMedia) + file fallback, shutter, "Reading…",
  review (all states), saved + totals, keep going. Reuse `src/lib/image` + vision.
- **Tests:** none (UI); machine tested in 3.1.
- **Reqs:** PE.1–PE.5.

### Task 3.3 — Desktop typed form + capability routing 🔴 ✅ (saves now create product + item_batch; `items` table no longer written)
- `detectPhone` picks camera vs typed form; desktop Add stock is typed-only (no
  camera, no upload, no image), saving via the same pipeline; prefill from
  Running-low (PD.2/PF.3); "Type it instead" on phone opens the typed form.
- **Tests:** detectPhone routing (reuse 0.2); typed-save produces a batch with no
  image.
- **Reqs:** PF.1–PF.4, PE.4.

---

## Step 4 — Take-out + Student page + QR poster 🔴

### Task 4.1 — Take-out logic + API (no names) 🔴 ✅
- `src/lib/takeout` (record-out, fix/delete math, feed grouping, FIFO), `POST
  /api/takeout(/fix|/delete|/recount)`, `GET /api/takeout?since=today`. **No name
  field anywhere; no name stored** (PH.2/PH.3/PO.5).
- **Tests (PO.5):** no name on any record; fix/delete re-derivation; recount
  adjustment; idempotency.
- **Reqs:** PH.1–PH.6.

### Task 4.2 — Take-out page UI 🔴 ✅
- Smart cards (Out today / Most taken / Count looks off), feed with
  All/Students/Staff, Record-items-out modal (**no name field**, in-place, no jump —
  PG.2), Fix modal.
- **Tests:** none (UI).
- **Reqs:** PH.1–PH.6, PG.2.

### Task 4.3 — Student page + QR poster (token + held-for-review) 🔴 ✅ (wrong token → real 404 via src/proxy.ts)
- Public `/s/[token]` (unguessable token → campus, PI.1): in-stock minus reserved,
  non-expired only (PI.2), group chips + search, cart capped at on-shelf − reserved,
  Done → student take-out (FIFO, no name/personal data, idempotent per submission).
  Public API accepts take-outs only for the token's campus (PI.5). Repeat submit from
  the same random device-cookie within 2 min → **held for review** (no stock change),
  surfaced in the Take-out feed to Accept/Discard (fix C, PI.6). `/poster` printable,
  QR → token URL.
- **Tests (PO.4/PO.6c):** students never see expired/out or reserved units; token
  only permits its own campus; 2-min repeat is held (no stock change) until Accept;
  Discard changes nothing; idempotent submit.
- **Reqs:** PI.1–PI.6.

---

## Step 5 — Community 🔴

### Task 5.1 — Community logic + API 🔴 ✅
- `src/lib/community` (recommendations/matchChip ranking; offer with reservation;
  withdraw releases reservation; claim → pickup; `completePickup` two-sided move that
  subtracts from A **exactly once** + releases the reservation + adds a batch to B).
  `POST /api/community/*`, `GET /api/community`.
- **Tests (PO.6/PO.6a):** offer makes no stock change (reservation only); withdraw
  releases; claim→pickup subtracts from A exactly once and conserves total across
  campuses, never negative; recommendation ranking.
- **Reqs:** PJ.1–PJ.7, PD.9a, PO.6a.

### Task 5.2 — Community page UI 🔴 ✅
- Recommendation cards, tabs (Available/Your offers/Requests), filters, offer/claim/
  request modals (in-place), pending pickups + Mark picked up. Uses `COMMUNITY_LABEL`.
- **Tests:** none (UI).
- **Reqs:** PJ.1–PJ.7, PC.3.

---

## Step 6 — Settings + Help 🔴

### Task 6.1 — Settings (email preview, rules, reset) + Help 🔴 ✅
- `/settings`: morning-email preview from status rules, status-rules legend, Reset
  demo data (re-seed active campus). `/help`: ordered how-it-works steps.
- **Tests:** email-preview model (which items are urgent) is pure + tested.
- **Reqs:** PK.1–PK.3.

---

## Step 7 — Polish, tests, docs, deploy 🔴

### Task 7.1 — Steering + docs 🔴 ✅
- `product.md` rule 10 replaced (follows design-reference + changes); add no-names
  (PH) + desktop typed-form (PF) rules. `structure.md`: new modules/routes/
  migrations. README/DEPLOY: routes, campus switcher, Supabase requirement,
  capability detection.
- **Reqs:** PN.1–PN.3.

### Task 7.2 — Accessibility + interaction pass 🔴 ✅ (`/intake/today` deleted; `/intake/test` kept as a PIN-only debug page, not in nav)
- 44 px targets, visible focus, AA contrast, no color-only meaning; verify no modal/
  drawer/stepper remount or scroll jump across the app (PG.1/PG.3). Clean up the
  temporary `/intake/test` + `/intake/today` once real pages cover them.
- **Reqs:** PG.1–PG.3, PL.3.

### Task 7.3 — Full verification + deploy check 🔴 ✅
- `npm run build` + `npm test` + `npm run lint` green; confirm deleting
  `src/app` + `src/components` leaves `src/lib` tests passing (PA.1); migration ready
  to run; commit, push, give you the phone + desktop + two-campus demo script.
- **Reqs:** PA.1, all PO.

---

## Dependencies & flags
- **Steps run in order** (each builds on the prior). Step 1 unblocks everything;
  Step 3 reuses Step 1 + Phase-1 vision; Step 5 reuses Step 1 stock moves.
- **Supabase migration `002_app.sql` must be run by you** in the SQL editor before
  the deployed app can persist the new model (I'll give you the SQL and flag it).
- **No 🔐 code steps**: Supabase + Vercel are connected; everything else is local
  code that auto-deploys on push.
- **Open questions in requirements.md** (campus-switch scope, products-vs-batches,
  recount semantics, periods, email send) — please resolve on review; I defaulted to
  the "properly built" interpretations noted there.
```
