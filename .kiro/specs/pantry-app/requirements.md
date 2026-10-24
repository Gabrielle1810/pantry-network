# Requirements — Pantry Network (full app)

Format: EARS. Requirements are numbered `P<area>.<n>`. This spec covers the whole
Pantry Network manager + student app, built properly in Next.js with real data in
Supabase, all logic in `src/lib`, and the real Gemini vision pipeline. It
**supersedes the open `intake-ui` spec**: those four screens become part of Step 3
here, and the Supabase work is Step 1.

**Reference:** `design-reference/app/` (vanilla-JS clickable prototype) is the
visual + behavioral reference — screens, copy, layout, status rules, interactions.
We do **not** copy its architecture (it re-renders the whole page with `innerHTML`
on every click and stores data in `localStorage`). `design-reference/` is kept as
documentation and is **excluded** from the Next.js build, TypeScript, ESLint, and
tests. The annotated screenshots' comments **override** the prototype where they
differ.

**Reuse (do not rebuild):** PIN gate + sessions (`src/lib/auth`), the Gemini vision
pipeline (`src/lib/vision`: provider abstraction, `LabelRead` schema, server-side
date re-check, fail-soft), image prep (`src/lib/image`), product corrections
(`src/lib/corrections`), idempotent saves, and the `ItemRepository` interface +
Memory/Supabase repos (`src/lib/db`) from Phase 1. This spec extends those, it does
not replace them.

---

## PA. Architecture & boundaries

- **PA.1** THE app SHALL be Next.js (App Router) + TypeScript + Tailwind on Vercel,
  with all business logic in `src/lib` and the API routes; `src/app` +
  `src/components` only render state and call `src/lib`. Deleting `src/app` +
  `src/components` SHALL leave every `src/lib` test passing.
- **PA.2** THE app SHALL NOT re-render whole pages on interaction and SHALL NOT use
  `localStorage` as the data store; React state + server data (Supabase) are the
  source of truth.
- **PA.3** THE build, TypeScript, ESLint, and test runner SHALL exclude
  `design-reference/**` (tsconfig `exclude`, eslint ignore, vitest exclude).
- **PA.4** THE manager pages SHALL sit behind the staff PIN gate + session
  (reuse `src/lib/auth` + middleware). THE student page and the QR poster target
  SHALL be public (no PIN, no login).
- **PA.5** "Today" SHALL be the real current date in `CAMPUS_TZ` everywhere
  (never a fixed date; the prototype's hard-coded 10/24/2026 is reference only).

## PB. Data model & derived stock

- **PB.1** THE canonical inventory quantity SHALL be **derived**, not stored as a
  free field: a product's on-shelf quantity is the sum of its intake batches minus
  take-outs/removals, plus/minus Community moves and recounts; it SHALL never go
  below 0.
- **PB.2** Take-outs and removals SHALL consume the **oldest batch first** (FIFO by
  `received_on`, then `created_at`).
- **PB.3** THE status of a product SHALL be computed by these rules, in order
  (from the prototype `statusOf`): `expired` if its soonest relevant date is past;
  else `out` if on-shelf = 0; else `soon` if a date is within 14 days; else `low`
  if on-shelf < (last restock amount ÷ 4); else `nodate` if it has no date and does
  not "doesn't expire"; else `good`.
- **PB.4** "Last restock amount" SHALL be the quantity of the most recent intake
  batch for that product (the `of` in the prototype); the low threshold is a quarter
  of it.
- **PB.5** Categories, groups, and their icon/color metadata SHALL come from the
  prototype's `CATEGORIES` map (invented); the student group labels from
  `STUDENT_GROUPS`.
- **PB.6** Seed/sample data SHALL be invented (campuses, items, numbers from
  `data.js`) and SHALL seed **dates relative to the day the seed runs**, so
  "expires in 2 days" still holds on demo day (PA.5). No real names/prices.
- **PB.7** A product SHALL be identified for grouping/corrections by its normalized
  name + brand (reuse `correctionKey`). Corrections remember name/brand/category,
  **never dates** (reuse `src/lib/corrections`).
- **PB.8** Every stock-changing event (intake, take-out, removal, fix, recount,
  Community move) SHALL be recorded as a ledger entry with a timestamp and reason,
  so history and "Out today" can be reconstructed and a product's stock equals the
  sum of its ledger.

## PC. App shell, navigation & labels

- **PC.1** THE manager shell SHALL be a desktop-first layout with a left sidebar:
  brand, a campus switcher, primary nav (Inventory, Add stock, Take-out,
  Community), and a footer nav (Help, Settings). Every page SHALL still work on a
  390 px phone.
- **PC.2** THE sidebar SHALL NOT contain a "Student page" link (removed per the
  annotated change); students reach their page only via the QR poster.
- **PC.3** THE label "Community" SHALL replace "Share" everywhere (nav, page title,
  copy, routes where user-visible), defined in **one exported constant** so it can
  be renamed again in one place.
- **PC.4** THE campus switcher SHALL list the sample campuses and switch the active
  campus for the demo (two campuses can show food sharing). The active campus SHALL
  scope all manager data.
- **PC.5** Navigation between manager pages SHALL update content without a full
  reload or layout shift (PA.2).

## PD. Inventory (Step 2)

- **PD.1** THE Inventory page SHALL show four smart cards matching the prototype:
  Running low, Expiring soon, Expired, and Items this period — each with its count,
  title, sub-text, and actions (from `inventoryPage`).
- **PD.2** THE "Running low" card's "Add items" action SHALL open Add stock
  prefilled with that product; on desktop this means the typed form prefilled
  (PF.3). Its "Request items" action SHALL open a Community request prefilled.
- **PD.3** THE "Expiring soon" card SHALL offer "Offer on Community" (prefilled) and
  "See all N" (switches to the soon tab).
- **PD.4** THE "Expired" card SHALL offer "Mark as removed" (removes all expired via
  the remove flow) and "See list".
- **PD.5** THE product list SHALL support tabs (All, Donated, Purchased, Running
  low, Expiring soon, Expired, No date) with live counts, a search over
  name/brand/category, and Simple vs Full-sheet views (from `simpleTable`/
  `fullSheet`).
- **PD.6** Each row SHALL show product (icon+name+brand+unit), category, in-stock
  (qty of restock-amount + a stock bar), expires (with "in N days"/"expired"/"no
  date"/"doesn't expire"), status pill, and last restock date.
- **PD.7** Clicking a row SHALL open an edit drawer (name, brand, unit, category,
  on-shelf, last-restock-amount, best-by, last-restock date, doesn't-expire, source,
  and recent history); saving SHALL persist and record a history entry; the drawer
  SHALL open with animation but edits inside SHALL update in place without re-mount
  or scroll jump (PG.1).
- **PD.7a** Editing the **on-shelf quantity** (in the drawer or the Full sheet)
  SHALL NEVER overwrite a stored number (fix B). It SHALL write a `recount`/
  adjustment ledger entry for the **difference** with reason "Edited by staff",
  visible in history — the same mechanism as a recount (PH.6). Derived on-shelf then
  reflects the edit without mutating batches.
- **PD.8** Selecting rows SHALL reveal a selection bar with Remove (opens the remove
  flow) and Offer on Community.
- **PD.9** THE remove flow SHALL let staff set per-line quantities, pick a reason
  (Expired, Damaged, Given out by hand, Moved to Community, Other), record the
  ledger entry, and offer a 10-second Undo. For reasons **other than** "Moved to
  Community", stock SHALL be reduced immediately (a negative `removal` ledger entry).
- **PD.9a** "Moved to Community" SHALL **not** reduce stock. It SHALL create an open
  Community offer and **reserve** that quantity (fix A). Reserved units SHALL be
  hidden from the student page (PI.2) and SHALL NOT be removable or offered a second
  time (available-to-act-on = on-shelf − reserved). Stock SHALL leave the offering
  campus only at "Mark picked up" (PJ.5), which also releases the reservation.
  Withdrawing the offer SHALL release the reservation with no stock change.
- **PD.10** THE Full-sheet view SHALL allow editing cells (name, category, brand,
  dates, quantity, unit, source) with changes persisting; "Composition" (group) is
  read-only and derived from category. Editing the **quantity** cell follows PD.7a
  (writes a "Edited by staff" adjustment entry, never an overwrite).

## PE. Add stock — phone camera flow (Step 3)

- **PE.1** On a phone, Add stock SHALL be the camera flow: point at the label →
  read (Gemini) → review → saved → keep going (reusing the Phase-1 pipeline + the
  intake-ui screens). It SHALL use the real `src/lib/vision` + `src/lib/image`.
- **PE.2** THE review screen SHALL match the intake-ui spec (date-found, no-date,
  unreadable, ambiguous, non-food states; green check / amber "?" badge; expiry +
  category chips; date row by `date_type`; quantity stepper; "Save N units";
  "Edit all details"; "Photograph the date instead").
- **PE.3** Saving SHALL add to stock as an intake batch (idempotent), update totals
  (before + added = after), and record a ledger entry; corrections SHALL be
  remembered on edited name/brand/category (never dates) and prefilled on the next
  matching read, with a "Remembered fix" hint.
- **PE.4** "Type it instead" on the phone SHALL open the same typed form as desktop
  (PF), with empty fields and focus on the name.
- **PE.5** Photo capture, read, and save SHALL preserve all Phase-1 behavior: 25 s
  timeout, one network retry, fail-soft to `unreadable`, server-side date re-check,
  elapsed + token logging, no photo stored, EXIF stripped.

## PF. Add stock — desktop typed form (Step 3, annotated change #1)

- **PF.1** THE app SHALL detect "phone" by **capability**, not user-agent alone:
  coarse pointer AND small viewport AND a usable camera (`getUserMedia` +
  `enumerateDevices` shows a video input). Only when all hold SHALL Add stock use
  the camera flow.
- **PF.2** On desktop (not a phone), Add stock SHALL be **only a typed form**: no
  live camera, no photo upload, no picture anywhere. It SHALL collect name, brand,
  size, category, quantity, unit, best-by (optional), doesn't-expire, and source,
  and SHALL save via the same pipeline as the phone review (same validation, totals,
  ledger, corrections — minus any image).
- **PF.3** WHEN Add stock is opened with a prefill product (from the Running-low
  card, PD.2) THE typed form SHALL prefill that product's name/brand/category.
- **PF.4** THE capability detection SHALL degrade safely: if detection is uncertain
  on a touch device, "Type it instead" is always available so no one is blocked.

## PG. Interaction correctness (annotated change #6)

- **PG.1** Modals, drawers, steppers, chips, and tabs SHALL update their values **in
  place**: changing a value inside an open modal/drawer SHALL NOT re-mount it,
  replay its open animation, shift layout, or jump scroll. Open/close MAY animate;
  value changes MUST NOT.
- **PG.2** THE "Record items out" modal specifically SHALL let staff change
  quantities and reason with no modal jump or scroll reset (the prototype's bug,
  explicitly avoided).
- **PG.3** Every interactive control SHALL have a ≥ 44 px touch target, a visible
  focus ring, an accessible name, and SHALL not convey meaning by color alone
  (status pills pair color with text/icon).

## PH. Take-out & student privacy (Step 4)

- **PH.1** THE Take-out page SHALL show smart cards (Out today, Most taken, Count
  looks off) and a feed of today's events (student scans + staff removals) with
  All/Students/Staff filters, matching the prototype.
- **PH.2** Take-out entries SHALL **never** show a person's name. Student entries
  show only "Student scan"; staff entries show only "Staff" (plus the products,
  quantities, and — for staff — the reason). (Annotated change #5.)
- **PH.3** THE "Record items out" modal SHALL **not** have a "Your name (optional)"
  field, and no name SHALL be stored on any take-out/removal record. (Change #5.)
- **PH.4** "Record items out" SHALL support per-line quantities, adding items, a
  reason, immediate stock reduction (FIFO, PB.2), a ledger entry, and 10-second
  Undo — with no modal jump (PG.2).
- **PH.5** "Fix" on a feed entry SHALL adjust the entry's quantities and re-derive
  stock by the difference; deleting an entry SHALL put its stock back.
- **PH.6** THE "Count looks off" card SHALL let staff reconcile a counted number vs
  the derived number (Use counted / Keep system) and record the adjustment.

## PI. Student page & QR poster (Step 4)

- **PI.1** THE student page SHALL be public (no PIN, no login, no names, no personal
  data), opened from the campus QR code. Its URL SHALL use a **random, unguessable
  token per campus** stored on the campus record (`campuses.student_token`), never
  the plain campus id (fix C). The route is `/s/[token]`; the token resolves to its
  campus server-side.
- **PI.2** THE student page SHALL list only products that are in stock
  (**on-shelf − reserved** > 0, PD.9a) and not expired (expired items are hidden —
  PB.3), with category group chips and search, and an "Use soon" hint on soon items.
- **PI.3** A student SHALL tap + / − to build a cart and press Done; quantities SHALL
  be capped at **on-shelf − reserved**. A normal submission SHALL record a student
  take-out (FIFO stock reduction, ledger entry, **no name, no personal data**) and
  show a thank-you with what they took.
- **PI.4** THE QR poster page SHALL be printable, show the campus name and steps,
  and render a QR code linking to that campus's token-based student URL (PI.1).
- **PI.5** THE public student API SHALL accept take-outs **only** for the campus
  that owns the submitted token, with quantities re-capped server-side at
  on-shelf − reserved (PI.2). Each submission SHALL carry a client-generated
  submission id so a double-tap of Done does not double-subtract (idempotent).
- **PI.6** THE app SHALL identify a device only by a **random device-id cookie**
  (never IP logging, no personal data). WHEN the same device submits again within
  **2 minutes** THE submission SHALL be saved as **"held for review"** (no stock
  change) and SHALL appear in the Take-out feed for staff to **Accept** (apply the
  stock change then) or **Discard** (fix C). Accepting re-caps quantities at the
  current on-shelf − reserved.

## PJ. Community (Step 5, renamed from Share)

- **PJ.1** THE Community page SHALL show recommendation smart cards (You could claim
  / You could offer / Someone needs) computed from the active campus's status vs
  nearby campuses' offers/requests (from `matchChip`/`sharePage`).
- **PJ.2** It SHALL have tabs: Available to claim, Your offers, Requests — with
  region and category filters on the available tab.
- **PJ.3** Posting an **offer** SHALL list spare stock to other campuses (item, qty,
  optional note); withdrawing SHALL remove it.
- **PJ.4** Posting a **request** SHALL announce a need (name, category, qty); a
  nearby campus can offer against it.
- **PJ.5** **Claiming** an offer SHALL create a pending pickup; **Mark picked up**
  SHALL move stock: subtract from the offering campus **exactly once** (a negative
  `community_out` ledger entry) and release the offer's reservation (PD.9a), and add
  an intake batch (`community_in`) to the claiming campus (both inventories update,
  ledger entries on both). This is the only cross-campus stock move, and stock
  leaves campus A only here — never at "Moved to Community" (fix A).
- **PJ.6** Community copy/labels SHALL use the single "Community" constant (PC.3).
- **PJ.7** Offer/claim/request quantities SHALL be bounded by available stock and
  SHALL never drive stock below 0.

## PK. Settings & Help (Step 6)

- **PK.1** THE Settings page SHALL show a morning-email preview (built from the same
  status rules as the smart cards), the status-rules legend, and a "Reset demo data"
  action (re-seeds the active campus's sample data).
- **PK.2** THE Help page SHALL show the ordered how-it-works steps linking to the
  relevant pages (poster, add, student, inventory, take-out, community).
- **PK.3** "Reset demo data" SHALL only affect sample data and SHALL be clearly
  labelled as a demo action.

## PL. Design system (Step 2+, applied throughout)

- **PL.1** THE Tailwind theme SHALL port the prototype's `:root` tokens (colors,
  radii) as theme tokens; the font SHALL be Figtree; icons SHALL be `lucide-react`.
- **PL.2** Layout SHALL be desktop-first with a sidebar for manager pages, and
  phone-first for Add stock (camera) and the student page; all pages usable at
  390 px.
- **PL.3** Accessibility: labelled inputs, real buttons, 44 px targets, visible
  focus, WCAG AA contrast, no color-only meaning (PG.3).
- **PL.4** No UI component library; no animation beyond simple open/close and value
  transitions (PG.1).

## PM. Data layer & Supabase (Step 1)

- **PM.1** THE Supabase schema SHALL support the derived-stock model: products,
  intake batches, take-out/removal ledger entries, Community offers/requests/pickups,
  and product corrections — with the migration in `supabase/migrations/` (extending
  `001_items.sql` or adding numbered migrations), RLS enabled, policies-later note.
- **PM.2** THE repository interface (`src/lib/db`) SHALL grow methods for the new
  entities (products/stock derivation, ledger, feed, offers/requests/pickups,
  campuses) with a MemoryRepository (seeded, for tests + local) and a
  SupabaseRepository (server-only, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`,
  never the `NEXT_PUBLIC_*`/anon keys), selected automatically when both vars exist.
- **PM.3** Stock derivation SHALL be a pure `src/lib` function over ledger +
  batches, independent of the repository, so it is unit-testable.
- **PM.4** All new API inputs SHALL be zod-validated; all cross-campus and
  stock-changing operations SHALL be idempotent where a client could retry.

## PN. Steering & docs

- **PN.1** `product.md` rule 10 SHALL be replaced: the UI now follows the
  design-reference + the annotated changes (no longer "placeholder"). THE no-names
  rule (PH.2/PH.3) and the desktop typed-form rule (PF) SHALL be added.
- **PN.2** `structure.md` SHALL list the new `src/lib` modules, components, routes,
  and migrations.
- **PN.3** README/DEPLOY SHALL document the new routes, the campus switcher, the
  Supabase requirement, and the capability-based phone detection.

## PO. Tests (Vitest + fast-check; mock vision only; no network)

- **PO.1** Property: derived stock equals sum of its ledger (intake − takeouts −
  removals ± moves ± recounts) and is **never negative**, for any sequence of events.
- **PO.2** Property: take-out/removal consumes oldest batch first (FIFO) and the
  remaining batches are consistent.
- **PO.3** Property: `statusOf` returns exactly one status and honors the documented
  precedence (expired > out > soon > low > nodate > good) for arbitrary inputs.
- **PO.4** Students never see expired or out items; expired are excluded from the
  student list for arbitrary inventories.
- **PO.5** No name is ever stored on a take-out/removal record (student or staff),
  for any recorded event.
- **PO.6** A Community claim → pickup conserves total stock across the two campuses
  (what leaves A equals what arrives at B) and neither goes negative.
- **PO.6a** (fix A) offer → claim → pickup subtracts from the offering campus
  **exactly once**: "Moved to Community" / offer creation makes no stock change (only
  a reservation); stock decreases only at pickup; withdrawing an offer before pickup
  leaves stock unchanged and releases the reservation.
- **PO.6b** (fix B) editing on-shelf writes an adjustment ledger entry equal to the
  difference (reason "Edited by staff"); derived on-shelf equals the edited value and
  batches are unchanged.
- **PO.6c** (fix C) a second submission from the same device within 2 minutes is
  "held for review" (no stock change) and only changes stock when staff Accept;
  Discard changes nothing; a token only permits take-outs for its own campus;
  reserved units are excluded from the student-available quantity.
- **PO.7** Corrections are applied on a matching read and never carry dates (reuse
  Phase-1 tests); idempotent saves/takeouts don't double-apply.
- **PO.8** Capability detection is a pure function of inputs (pointer, viewport,
  camera availability) and is unit-tested; no UA sniffing.
- **PO.9** Totals math (before + added = after), expiry status + 14-day boundary,
  and seed-relative dates are unit-tested. No snapshot/visual tests for UI.

---

## Resolved decisions (review round)

1. **Campus scope — two real seeded campuses.** `harbor` is the home campus with the
   full `data.js` inventory; `cedar` is the partner campus with a smaller invented
   inventory (~10–12 items). Both have **live** derived inventories so a Community
   pickup actually moves stock between them in the demo. The other four campuses
   (`northfield`, `riverside`, `bayview`, `hillcrest`) appear only as Community
   offers/requests. The campus switcher sets the active campus (session cookie) for
   manager pages. The **student page is scoped by its QR token** (PI.1), not the
   cookie.
2. **Products + batches + ledger — confirmed.** `products` identity (normalized
   name+brand per campus) with many `item_batches`; on-shelf is derived from batches
   + ledger (PB.1). Seed batches + ledger so each item's derived on-shelf equals its
   `qty` in `data.js`, and "last restock amount" (`of`) equals the most recent intake
   batch — so Inventory numbers match the prototype on first load.
3. **Recount** writes an adjustment ledger entry (approved).
4. **Periods** ("Summer 2026 · 6/1 to 7/30") are cosmetic labels, not a first-class
   entity (approved).
5. **Morning email** is preview-only, no real sending (approved).
6. **Fixes A/B/C** (this round) folded into PD.9/PD.9a, PD.7a/PD.10, PI.1–PI.6, PJ.5,
   and PO.6a–c above.
