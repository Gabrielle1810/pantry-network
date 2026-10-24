# Design — Intake UI

Implements `requirements.md` (UI1–UI16). Builds the real capture → review → save
flow from the four screenshots, on top of the existing recognition slice. The
non-negotiable boundary (UI1.2): **all behavior lives in `src/lib` and the API
routes; `src/app/intake` + `src/components/intake` only render state and call
`src/lib`.** Deleting those folders must leave every `src/lib` test green.

---

## 1. Architecture

```
 Phone browser (designed UI — src/app/intake + src/components/intake)
   │  getUserMedia viewfinder → freeze frame → src/lib/image.prepareImage
   │  drives the headless machine in src/lib/intake; renders its state
   ▼
 Next.js API routes (server only)
   ├─ POST /api/vision/read-label   (existing; tuned: 25s timeout, elapsed log,
   │                                 date-only mode)
   ├─ POST /api/items               (new) zod → repo.saveBatch (idempotent) +
   │                                 record correction if name/brand/category edited
   └─ GET  /api/items?since=today   (new) repo.listBatches → today page + totals
   ▼
 src/lib (headless, browser-free, tested)
   ├─ intake/     state machine, ReviewDraft, buildDraft, computeEditedFields,
   │              savable(), unit/pluralize, the review view-model
   ├─ expiry/     expiryStatus(expires_on, today) → status + days (UI6)
   ├─ corrections/ correctionKey(read), applyCorrection(draft, correction)
   ├─ totals/     inventoryTotals(batches, key) → before/added/after (UI10)
   ├─ items/      ItemBatch type + itemBatchSchema + computeArrivedExpired
   ├─ db/         ItemRepository iface, MemoryRepository (+ corrections), selector
   ├─ dates/      (existing) detectAmbiguity, spellOut, toISO; + todayInTz, daysUntil
   ├─ vision/     (existing) LabelRead, providers, SYSTEM_PROMPT, applyServerRechecks;
   │              + DATE_ONLY_PROMPT and optional date_box field (stretch)
   ├─ image/      (existing) prepareImage, computeTargetDimensions
   └─ auth/       (existing) session + PIN
   ▼
 Storage: MemoryRepository now (per-instance, non-persistent).
          SupabaseRepository is the NEXT task — required for totals/fixes to
          persist on Vercel (UI13.8).
```

### Why a headless machine
The four screens are one flow with sharp invariants (no save without confirm; no
save of an unresolved ambiguous date; dates optional; date-only re-photo preserves
other fields). Putting that in `src/lib/intake` as a pure reducer makes it testable
without a browser and lets the placeholder-vs-designed UI question stay purely
cosmetic — the components never decide anything.

---

## 2. Module designs

### 2.1 `src/lib/intake` — state machine + ReviewDraft

States (UI3.1): `capture → reading → review → saving → saved`, plus `error`.
`review` is also entered for unreadable/dateless reads.

```ts
type IntakeState =
  | { kind: "capture" }
  | { kind: "reading"; frame: Frame | null }       // frozen frame while awaiting read
  | { kind: "review"; draft: ReviewDraft; original: LabelRead | null; frame: Frame | null;
      remembered: boolean; note: string | null }
  | { kind: "saving"; draft: ReviewDraft; original: LabelRead | null }
  | { kind: "saved"; batch: ItemBatch; totals: InventoryTotals }
  | { kind: "error"; message: string; retry: IntakeEvent };

type Frame = { base64: string; width: number; height: number }; // in-memory only (UI2.9)
```

Events (UI3.2) and the reducer `reduce(state, event, ctx): IntakeState`. `ctx`
carries `today` (CAMPUS_TZ ISO), optional `remembered` correction, and the unit
dictionary. Invariants enforced in the reducer, not the UI:
- `CONFIRM_SAVE` is honored only from `review` with `savable(draft)` true → `saving`
  (UI3.6). Otherwise it is a no-op.
- A draft with `date_ambiguous && chosen == null && !dont_track && !doesnt_expire`
  has `savable=false` and `expires_on=null` until `CHOOSE_DATE`/`KEEP_UNKNOWN`
  (UI11.1).
- `SET_DONT_TRACK(true)` and a non-food read (`doesnt_expire`) force
  `expires_on=null` and hide/disable the date row (UI4.8).

`ReviewDraft` (§6.2 of the intake spec, extended):

```ts
interface ReviewDraft {
  name: string; brand: string | null; size_text: string | null;
  category: string; category_group: string | null;
  quantity: number;                       // 1..999
  unit: string;                           // singular, e.g. "can"; default "item"
  expires_on: string | null;
  date_type: "use_by"|"best_by"|"sell_by"|"unlabeled"|"none";
  date_precision: "day"|"month"|null;
  date_source: "photo"|"typed"|null;
  date_ambiguous: boolean; date_candidates: string[]; chosen_date: string | null;
  date_choices: { iso: string; label: string }[]; // month-first first (R7.4)
  dont_track: boolean; doesnt_expire: boolean; perishable: boolean;
  source: "donated"|"purchased"|null;
  arrived_expired: boolean;
  note: string | null;                    // "couldn't find a date" / "date has passed"
}
```

Pure helpers in this module:
- `buildDraft(read, ctx): ReviewDraft` — applies UI4.2–UI4.9; if `ctx.remembered`
  exists, prefills corrected name/brand/category and sets a `remembered` flag
  (UI9.2) **without** marking them edited (UI9.4).
- `emptyDraft(ctx): ReviewDraft` — for "Type it instead" and unreadable.
- `savable(draft): boolean` — UI5.8/UI7.3/UI11.1.
- `computeEditedFields(original, draft, remembered): string[]` — UI4.7, excludes
  auto-applied remembered values.
- `pluralizeUnit(unit, n)` and `saveButtonLabel(draft)` → "Save 4 cans" (UI5.8).
- `applyDateOnlyRead(draft, read): ReviewDraft` — merges only the date fields,
  keeps name/brand/category/quantity (UI7.5).

### 2.2 `src/lib/expiry` — presentation logic (UI6)

```ts
type ExpiryStatus = "expired" | "today" | "soon" | "ok" | "none";
function expiryStatus(expiresOn: string | null, todayIso: string):
  { status: ExpiryStatus; days: number | null };  // days = whole days until expiry
```
`soon` = 1..7, `today` = 0, `expired` < 0, `ok` ≥ 8, `none` when null (UI6.2). The
chip text/color mapping (UI6.3) is a tiny pure `expiryChip(status, days)` returning
`{ text, tone: "amber"|"red"|"neutral" }` — components render tone→class.

### 2.3 `src/lib/dates` — additions (keep existing)
Add `todayInTz(tz): string` (ISO date in the campus zone via `Intl.DateTimeFormat`,
never UTC — R7.7) and `daysUntil(iso, todayIso): number`. Existing `detectAmbiguity`,
`spellOut`, `toISO`, `lastDayOfMonth` unchanged. (This advances part of Task 6; the
remaining Task-6 property tests still land with that task.)

### 2.4 `src/lib/corrections` — remembered fixes (UI9)

```ts
interface ProductCorrection { name: string|null; brand: string|null; category: string|null; }
function correctionKey(name: string|null, brand: string|null): string; // norm+lower, "name|brand"
function applyCorrection(draft, c: ProductCorrection): ReviewDraft;     // prefill, no dates
function diffCorrection(original: LabelRead, draft): ProductCorrection | null; // what to store
```
`correctionKey` lowercases, trims, collapses whitespace (UI9.5). `diffCorrection`
returns the corrected name/brand/category **only if staff changed one of them**, and
**never** any date field (UI9.3). The key is computed from the *original read* so the
next identical read matches (UI9.1).

### 2.5 `src/lib/totals` — inventory math (UI10)

```ts
interface InventoryTotals { before: number; added: number; after: number; firstBatch: boolean; }
function inventoryTotals(existing: ItemBatch[], key: string, added: number): InventoryTotals;
```
`before` = sum of `quantity` over existing batches whose `correctionKey(name,brand)`
equals `key`; `after = before + added`; `firstBatch = before === 0` (UI10.3/UI10.6).
Pure; the saved screen renders the sentence (UI10.2).

### 2.6 `src/lib/items` — ItemBatch (UI13.1)
`ItemBatch` type + `itemBatchSchema` (zod) matching intake design §6.3, plus
`computeArrivedExpired(expires_on, received_on)` (R11.9). Reuses taxonomy for
`category_group`.

### 2.7 `src/lib/db` — repository (UI13.5)

```ts
interface ItemRepository {
  readonly name: "memory" | "supabase";
  saveBatch(input: SaveBatchInput): Promise<ItemBatch>;      // idempotent on idempotencyKey
  listBatches(campusId: string, since: "today" | string): Promise<ItemBatch[]>;
  getCorrection(campusId: string, key: string): Promise<ProductCorrection | null>;
  saveCorrection(campusId: string, key: string, c: ProductCorrection): Promise<void>;
}
function getRepository(): ItemRepository; // Supabase when both env vars set, else Memory
```
`MemoryRepository`: module-level maps (`batches[]`, `idempotency`, `corrections`),
seeded with clearly-fake Campus A items so totals show a non-zero "before" in the
demo. Idempotency: a repeat key returns the stored batch (UI13.3). Per-instance and
non-persistent (UI13.8).

### 2.8 Vision additions (UI14, UI7.5, UI5.10)
- Route: `READ_TIMEOUT_MS = 25_000` (UI14.2); wrap each provider call to log
  `elapsed_ms` (UI14.1) next to tokens. Provider default model
  `gemini-3.5-flash-lite` (UI14.3).
- `DATE_ONLY_PROMPT`: a focused prompt ("Read only the freshness date on this
  label…") plus a date-only JSON subschema; the route gains a `mode: "date_only"`
  input that selects it and returns only date fields (UI7.5). Same timeout/retry/
  fail-soft.
- **Stretch date box (UI5.10):** add optional `date_box: [ymin,xmin,ymax,xmax] |
  null` (0–1000 normalized, per the current Gemini object-detection docs) to
  `LabelRead`, prompt for it, and have the UI scale it to the displayed photo and
  draw a green outline. If `date_box` is null/implausible, no overlay. Gated and
  non-blocking. (Verified feasible against ai.google.dev image-understanding /
  bounding-box docs; content rephrased for compliance.)

---

## 3. UI composition (`src/app/intake`, `src/components/intake`)

Thin components, each bound to machine state. One client route owns the machine:
- `/intake` — hosts the machine; renders `<CaptureScreen>`, `<ReviewScreen>`,
  `<SavedScreen>`, `<ErrorScreen>` by `state.kind`.
- `/intake/today` — list page (totals/`edited_fields`/active repo); already planned
  in the base spec, wired to `GET /api/items`.

Components (presentational): `CaptureScreen` (viewfinder + file fallback + shutter +
"Type it instead"), `Viewfinder` (getUserMedia, corner brackets), `ReviewScreen`
(photo + badge + title/pencil + `ExpiryChip` + `CategoryChip` + `DateRow` + `Stepper`
+ primary/secondary buttons), `FullDetailsForm`, `AmbiguousDateChoice`, `SavedScreen`,
`RememberedFixHint`, shared `Chip`, `IconButton` (accessible name required).

### 3.1 Capture → read sequence
`SHUTTER` → grab frame from `<video>` to a canvas → `prepareImage`-equivalent (the
canvas is already the resized source) → `reading` → `POST /api/vision/read-label` →
`READ_OK`/`READ_UNREADABLE`/`READ_ERROR`. On denied permission, swap the viewfinder
for the file input; the rest is identical.

### 3.2 Date-only re-photo
From the no-date review, `PHOTOGRAPH_DATE` → reopen viewfinder in date-only mode →
second capture → `POST /api/vision/read-label { mode: "date_only" }` →
`applyDateOnlyRead(draft, read)` merges date fields only (UI7.5/UI7.6).

### 3.3 Save
`CONFIRM_SAVE` → `saving` → `POST /api/items { idempotencyKey, batch, read,
editedFields }`. The route persists the batch and, if `editedFields` include
name/brand/category, calls `saveCorrection` with `diffCorrection` (UI9.1). Response
includes the saved batch; the client fetches/derives totals for the saved screen
(server returns `before`/`after` so no second trust boundary).

---

## 4. State / screen matrix

| Machine state | Screen | Key copy |
|---|---|---|
| capture | Capture (SS1) | "Show the item's name and the date on the label" / "Hold steady. We read it for you." |
| reading | Capture, frozen | "Reading the label…" |
| review (date, food) | Review date-found (SS2) | green check; "Save {n} {unit}"; "Edit all details" |
| review (no date, food) | Review no-date (SS3) | amber "?"; "No date found"; "Save without a date"; "Photograph the date instead" |
| review (unreadable) | like SS3, empty name | focus name; "Save without a date" (disabled until name) |
| review (ambiguous) | SS2 layout + two date buttons | month-first first + "Keep Unknown" |
| review (non-food) | SS2 layout, no date row | "Doesn't expire" chip |
| saved | Saved (SS4) | "Saved to Inventory"; "{name}: {before} on the shelf + {n} added = {after}" / "{n} added" |
| error | Error | plain message + Retry |

---

## 5. Design tokens (Tailwind v4, `globals.css` `@theme`)

Colors extracted from the screenshots (approximate; tuned for WCAG AA against their
pairings — UI12.4):

```css
@theme {
  --color-app: #eef0ea;        /* off-white/sage app background */
  --color-surface: #ffffff;    /* cards */
  --color-ink: #1b1d1a;        /* near-black primary button + headings */
  --color-brand: #1f6b3b;      /* dark green: links, success check */
  --color-brand-soft: #e4efe6; /* green-tinted saved card */
  --color-amber: #9a6a00;      /* warning text (on soft amber chip) */
  --color-amber-soft: #f6e8c9;
  --color-danger: #b42318;     /* expired/red */
  --color-chip: #eceef0;       /* neutral category chip */
  --color-muted: #5c6159;      /* secondary text */
}
```
Primary button: `bg-ink text-white rounded-2xl` full width, min-h 52 px. Chips:
`rounded-full px-3 py-1 text-sm`. Cards: `rounded-2xl bg-surface p-4`. All tap
targets ≥ 44 px (UI12.3). Amber/red always paired with text + icon (UI12.4). Exact
hexes will be verified against the screenshots during build and adjusted to pass AA.

---

## 6. Data model additions

### 6.1 ItemBatch / intake_read — as in the base intake design §6.3 (unchanged).

### 6.2 product_corrections (new; migration + memory) — UI13.7

```sql
create table product_corrections (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null,
  read_key text not null,            -- normalized name|brand from the original read
  corrected_name text,
  corrected_brand text,
  corrected_category text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (campus_id, read_key)       -- one correction per product per campus
);
alter table product_corrections enable row level security; -- policies with user accounts
```
Never stores dates (UI9.3). The migration file is **not executed** by the build; it
is applied in the Supabase setup task.

---

## 7. API contract additions

### POST /api/items  (session required)
Request:
```json
{ "idempotencyKey": "uuid",
  "batch": { "name": "Tomato paste", "brand": "Hunt's", "size_text": null,
    "category": "Sauces/Pastes/Spread", "quantity": 4, "unit": "can",
    "expires_on": "2026-10-26", "date_type": "best_by", "date_precision": "day",
    "date_source": "photo", "dont_track": false, "doesnt_expire": false,
    "perishable": false, "source": null },
  "read": { "...": "original LabelRead for the intake_read + correction key" },
  "editedFields": ["name","quantity"] }
```
Response `200`:
```json
{ "batch": { "id": "...", "campus_id": "campus-a", "received_on": "2026-10-24",
    "arrived_expired": false, "edited_fields": ["name","quantity"], "...": "..." },
  "totals": { "before": 2, "added": 4, "after": 6, "firstBatch": false },
  "remembered": false, "repository": "memory" }
```
Errors: `400 { error:"invalid_batch", details:[...] }`, `401 { error:"unauthorized" }`,
`500 { error:"save_failed" }` (persistence errors are not fail-soft like vision).

### POST /api/vision/read-label  (tuned)
Adds optional `"mode": "read" | "date_only"` (default "read"). Same response shape;
in `date_only` only the date fields are meaningful. 25 s timeout; logs `elapsed_ms`.

### GET /api/items?since=today  (session required)
`200 { "repository":"memory", "campusId":"campus-a", "items":[ ItemBatch, ... ] }`.

---

## 8. Accessibility plan (UI12.4/UI12.5, product rule 8)
Labelled inputs; `<button>` for all actions; `aria-label` on icon buttons (pencil
"Edit name and brand", stepper "Decrease quantity"/"Increase quantity", close, camera);
`role="status"` for "Reading the label…"; `role="alert"` for errors; chips convey
state via text, not color alone; focus moves to the name field on unreadable (UI8.1)
and to the review heading on `READ_OK`. Full AA audit noted as manual (per steering,
full visual a11y lands with the broader redesign, but these basics are in scope now).

---

## 9. Test strategy (mock only — UI16)
- `corrections`: applied on matching read; key case-insensitive; never carries dates.
- `totals`: before+added=after; first-batch; grouping by key.
- `intake` machine: no `saving` without `CONFIRM_SAVE`; no unresolved-ambiguous save;
  `applyDateOnlyRead` keeps non-date fields; `computeEditedFields` excludes
  auto-remembered values.
- `expiry`: status + 7-day boundary + none.
- `items`/route: "save without a date" → `expires_on=null`; double-submit idempotency.
- `dates`: `todayInTz`/`daysUntil` basic cases.
No network, no real AI, no snapshot tests (UI16.7).
```
