# Requirements — Intake UI (real capture → review → save flow)

Format: EARS. Every requirement is numbered `UI<n>`. This spec builds the real,
designed Intake UI from the four provided screenshots, replacing the placeholder
screens for the Intake flow only. It depends on the existing recognition slice
(`/api/vision/read-label`, `src/lib/vision`, `src/lib/dates`, `src/lib/items/taxonomy`,
`src/lib/image`, `src/lib/auth`) and adds the save pipeline, the intake state
machine, product corrections, inventory totals, and the design system.

The four screenshots are the **visual spec** for this flow (layout, hierarchy,
spacing, color, copy). They supersede product.md rule 10 (placeholder UI) **for
the Intake screens only**; every other product rule still holds. Screens not in
the screenshots (ambiguous date, non-food, unreadable, errors) follow the same
visual system.

Guiding constraint (unchanged, R1.3 / product rule "logic out of the UI"): all
behavior lives in `src/lib` and the API routes. Deleting `src/app/intake` and
`src/components` must leave every `src/lib` test passing.

---

## UI1. Scope, platform, and the placeholder-rule change

- **UI1.1** THE Intake flow SHALL be a designed, phone-first UI matching the four
  screenshots closely in layout, hierarchy, spacing, color, and copy, on a 390 px
  wide viewport.
- **UI1.2** THE system SHALL keep all behavior (capture state machine, draft
  rules, date handling, corrections, totals, validation, edited-field tracking)
  in `src/lib` and the API routes; `src/app/intake/*` and `src/components/intake/*`
  SHALL only render state and call `src/lib` functions.
- **UI1.3** WHEN product.md rule 10 is applied to the Intake screens THE project
  SHALL treat the four screenshots as the visual spec (not "inspiration"); the
  rule change SHALL be recorded in product.md and the intake specs. All other
  product rules (dignity, privacy, accessibility, sample-data, phone-first)
  remain in force.
- **UI1.4** THE Intake flow SHALL remain usable with keyboard and screen reader:
  labelled controls, real buttons, screen-reader text for every icon-only button,
  and a visible focus order that follows the reading order (UI12).

## UI2. Capture screen ("Add stock")

- **UI2.1** THE capture screen SHALL show a header with a "Close" control (left,
  dark-green link) that leaves the flow, and a centered title "Add stock".
- **UI2.2** THE capture screen SHALL show a live rear-facing camera viewfinder
  obtained via `getUserMedia({ video: { facingMode: "environment" } })`, inside a
  rounded frame with the four corner brackets shown in screenshot 1.
- **UI2.3** IF camera permission is denied or `getUserMedia` is unavailable THEN
  THE system SHALL fall back to `<input type="file" accept="image/*"
  capture="environment">` (the phone's own camera), with the same surrounding copy
  and shutter affordance.
- **UI2.4** THE capture screen SHALL show the copy "Show the item's name and the
  date on the label" (title) and "Hold steady. We read it for you." (subtitle).
- **UI2.5** THE capture screen SHALL show a large round shutter button that, when
  pressed, captures the current frame.
- **UI2.6** THE capture screen SHALL show a "Type it instead" link (dark-green)
  that opens the review card with empty fields and focus on the name field
  (an empty draft; no photo).
- **UI2.7** WHEN the shutter is pressed THE UI SHALL freeze the captured frame and
  show a "Reading the label…" state until the read returns (success, unreadable,
  or error).
- **UI2.8** WHEN a frame is captured THE UI SHALL prepare the image with
  `src/lib/image.prepareImage` (resize longest side ≤ 1280 px, JPEG ~0.8, EXIF
  stripped) before upload, and SHALL upload only the prepared JPEG (R4.3/R4.4).
- **UI2.9** THE system SHALL NOT store the photo (R11.8/R14.4); the frozen frame is
  kept only in memory for the review screen.

## UI3. Intake state machine (`src/lib/intake`)

- **UI3.1** THE system SHALL implement a headless state machine with states
  `capture`, `reading`, `review`, `saving`, `saved`, and `error`.
- **UI3.2** THE machine SHALL accept events: `SHUTTER`, `TYPE_INSTEAD`,
  `READ_OK(read)`, `READ_UNREADABLE`, `READ_ERROR(msg)`, `EDIT(patch)`,
  `CHOOSE_DATE(iso)`, `KEEP_UNKNOWN`, `SET_DONT_TRACK(bool)`,
  `PHOTOGRAPH_DATE`, `DATE_READ_OK(read)`, `CONFIRM_SAVE`, `SAVE_OK(batch)`,
  `SAVE_ERROR(msg)`, `ADD_ANOTHER`, `RETAKE`, `RESET`.
- **UI3.3** WHEN a read returns `status:"ok"` THE machine SHALL build a
  `ReviewDraft` from the `LabelRead` and enter `review`.
- **UI3.4** WHEN a read returns `status:"unreadable"` THE machine SHALL enter
  `review` with an empty-name draft and a "couldn't find a date" note, focusing the
  name field (UI8).
- **UI3.5** WHEN any read or save error occurs THE machine SHALL enter `error` (or
  `review` carrying a message, per UI11) with a human-readable message and a retry
  affordance; it SHALL NOT surface a stack trace.
- **UI3.6** THE machine SHALL NOT transition to `saving` except via `CONFIRM_SAVE`
  from `review` with a savable draft (UI5.8). (P8-style invariant.)
- **UI3.7** WHEN a save succeeds THE machine SHALL enter `saved` and SHALL be able
  to return to `capture` on `ADD_ANOTHER`.

## UI4. ReviewDraft construction (`src/lib/intake`)

- **UI4.1** THE system SHALL transform a `LabelRead` into a `ReviewDraft`
  independently of any UI (`buildDraft(read, ctx)`), where `ctx` carries today's
  date in `CAMPUS_TZ` and any remembered correction (UI9).
- **UI4.2** THE draft SHALL prefill `name` and `brand` from the read, keep both
  editable, and require a non-empty `name` to save (R8.5).
- **UI4.3** WHEN the read date is unambiguous THE draft SHALL prefill `expires_on`,
  `date_type`, and `date_precision`; WHEN the read is ambiguous THE draft SHALL set
  `expires_on = null` and carry both candidates until a choice is made (R8.6/R8.7).
- **UI4.4** THE draft SHALL prefill `quantity` from `quantity_visible` when present,
  else `1`, and SHALL accept only integers in 1..999 (R8.10).
- **UI4.5** THE draft SHALL prefill `category` as a normalized taxonomy value or
  "Uncategorized" and keep it editable (R8.11).
- **UI4.6** THE draft SHALL set `date_source` to `"photo"` when a read date is kept
  unchanged and `"typed"` when staff set or change the date (R8.12).
- **UI4.7** THE system SHALL compute `edited_fields` by comparing the final draft
  against the original read (and against a remembered correction, which does not by
  itself count as a staff edit) (R8.13).
- **UI4.8** WHEN `doesnt_expire` is true (non-food) THE draft SHALL hide the date
  row and keep all date values null (R8.8); WHEN `dont_track` is set THE draft SHALL
  clear and disable the date row (R8.9).
- **UI4.9** THE draft SHALL carry `arrived_expired` computed as true exactly when
  `expires_on` is non-null and before today in `CAMPUS_TZ` (R11.9).

## UI5. Review screen — date found (screenshot 2)

- **UI5.1** THE review screen SHALL show a header with "Retake" (left, dark-green)
  and the title "Add stock", and SHALL keep the captured photo on top inside the
  same bracketed frame.
- **UI5.2** WHEN a date was found THE photo SHALL carry a green circular check
  badge overlapping its bottom edge.
- **UI5.3** THE review screen SHALL show a title line "{name} · {brand}" with a
  pencil icon; activating the pencil (or tapping the title) SHALL edit name and
  brand inline. WHEN brand is null THE title SHALL show just the name.
- **UI5.4** THE card SHALL show an expiry chip whose text and color follow the
  date: amber "Expires in N days" when the item expires in 7 days or fewer; "Expires
  today" when N = 0; red "Date has passed" when already expired; a neutral/green
  "Expires in N days" otherwise. (Thresholds computed in `src/lib`, UI6.)
- **UI5.5** THE card SHALL show a category chip with the normalized category value.
- **UI5.6** THE card SHALL show a date row labelled by `date_type` — "Best by"
  (best_by), "Use by" (use_by), "Sell by" (sell_by), or "Date" (unlabeled/none) —
  with the formatted date and an "Edit" link that lets staff type/pick a date.
- **UI5.7** THE card SHALL show a "How many?" stepper (− / value / +) bound to
  `quantity`, clamped to 1..999, prefilled per UI4.4; the − and + controls SHALL
  have screen-reader labels.
- **UI5.8** THE primary button SHALL read "Save {n} {unit}" where `unit` is the
  item's plural unit (e.g. "cans"), defaulting to "items"; it SHALL be enabled only
  when the draft is savable (non-empty name, quantity in range, and no unresolved
  ambiguous date).
- **UI5.9** THE review screen SHALL show a secondary "Edit all details" link that
  opens the full form (name, brand, size, category, date, don't-track checkbox,
  delivery source). The full form SHALL contain no business logic (UI1.2).
- **UI5.10 (stretch)** IF the current Gemini model returns a usable bounding box
  for the printed date THEN THE UI MAY outline the date region on the photo in
  green; IF no plausible box is returned THEN THE UI SHALL omit the overlay with no
  error. This SHALL never block or delay the read result.

## UI6. Expiry presentation logic (`src/lib`)

- **UI6.1** THE system SHALL provide a pure function that, given `expires_on` and
  today in `CAMPUS_TZ`, returns the number of whole days until expiry and a status
  one of `expired | today | soon | ok | none` (none when `expires_on` is null).
- **UI6.2** `soon` SHALL mean 1..7 days inclusive; `today` SHALL mean 0 days;
  `expired` SHALL mean a past date; `ok` SHALL mean 8+ days.
- **UI6.3** THE chip copy SHALL be derived from that status only (no date math in
  components): "Date has passed" (expired, red), "Expires today" (today, amber),
  "Expires in N days" (soon amber / ok neutral), and the no-date chip per UI7.

## UI7. Review screen — no date found (screenshot 3)

- **UI7.1** WHEN no date was found (`date_type:"none"` / `expires_on:null` and the
  item is food) THE photo SHALL carry an amber circular "?" badge instead of the
  green check, and the subtitle SHALL read "We couldn't find a date on the label".
- **UI7.2** THE card SHALL show a "No date found" chip (amber) and the category
  chip; the date row SHALL read "Unknown · add it", which when tapped lets staff
  type a date.
- **UI7.3** THE primary button SHALL read "Save without a date"; saving SHALL
  always be allowed with `expires_on = null` (product rule 2, R11.4).
- **UI7.4** THE no-date screen SHALL show a secondary link "Photograph the date
  instead".
- **UI7.5** WHEN "Photograph the date instead" is chosen THE camera SHALL reopen in
  a **date-only mode**: the second photo SHALL be sent with a date-only prompt and
  the result SHALL fill only the date fields (`date_raw`, `date_type`, `expires_on`,
  `date_precision`, `date_ambiguous`, `date_candidates`), preserving the name,
  brand, category, and quantity already on screen.
- **UI7.6** WHEN the date-only read is itself unreadable or dateless THE UI SHALL
  return to the no-date review unchanged and SHALL show a brief "Still no date —
  type it or save without one" note.

## UI8. Unreadable read (no screenshot; same visual style)

- **UI8.1** WHEN the read is `unreadable` THE review screen SHALL render like the
  no-date screen (amber "?" badge, "No date found" chip) but with an empty name and
  focus placed on the name field.
- **UI8.2** THE primary button SHALL read "Save without a date" and SHALL be
  disabled until a non-empty name is entered.

## UI9. Remembered fixes — product corrections (`src/lib/corrections`, `src/lib/db`)

- **UI9.1** WHEN staff correct `name`, `brand`, or `category` on a draft THE system
  SHALL persist a **product correction** keyed by the normalized original read
  (normalized read name + brand), storing the corrected values.
- **UI9.2** WHEN a later read matches a stored correction's key THE system SHALL
  prefill the corrected `name`/`brand`/`category` into the draft and SHALL show a
  small "Remembered fix" hint near the edited field(s).
- **UI9.3** THE system SHALL NEVER store or reuse date values as part of a
  correction; each batch's date is independent (product rule 4; "never invent
  data").
- **UI9.4** A remembered fix applied automatically SHALL NOT, by itself, mark those
  fields as `edited_fields`; only a staff change on the current draft counts
  (UI4.7). (If staff then further edit a remembered value, that is an edit.)
- **UI9.5** THE correction key SHALL be case-insensitive and whitespace-normalized
  so trivial read variations match the same correction.
- **UI9.6** Corrections SHALL be read and written through the repository (UI13); the
  memory implementation is used now, Supabase later.

## UI10. Saved screen and inventory totals (screenshot 4)

- **UI10.1** THE saved screen SHALL show a header "Done" (left, dark-green) that
  exits to `/intake/today`, and a green-tinted product card with a product icon, a
  "+{n} {unit}" pill, and a green check.
- **UI10.2** THE saved screen SHALL show "Saved to Inventory" and a totals line
  "{name}: {before} on the shelf + {n} added = {after}", where `before` is the sum
  of this campus's previously-saved quantities for the same product and `after =
  before + n`.
- **UI10.3** WHEN this is the first batch for the product (before = 0) THE totals
  line SHALL instead read "{n} added".
- **UI10.4** THE totals arithmetic (grouping batches by product, summing
  quantities, computing before/after) SHALL be a pure function in `src/lib`; the
  component SHALL only render its result.
- **UI10.5** THE saved screen SHALL show a "Next step · Add another item" row that
  returns to the capture screen, and a "Finish" link to `/intake/today`.
- **UI10.6** "Same product" for totals SHALL be determined by the same normalized
  key used for corrections (normalized name + brand), so totals and fixes agree.

## UI11. Ambiguous date, non-food, and error states (no screenshots; same style)

- **UI11.1** WHEN the draft carries an ambiguous date THE date row SHALL present
  two buttons showing both spelled-out dates (month-first reading first, per R7.4)
  plus a "Keep Unknown" option; the draft SHALL NOT hold an `expires_on` until one
  is chosen, and SHALL NOT be savable with an unresolved ambiguous date (R8.15).
- **UI11.2** WHEN the item is non-food (`doesnt_expire` true) THE card SHALL show a
  "Doesn't expire" chip and SHALL omit the date row entirely (R8.8).
- **UI11.3** WHEN a read or save fails THE UI SHALL show a plain message and a
  retry button, never a 500 page for a vision problem (R5.9); a save (persistence)
  error MAY surface as a retryable error distinct from the fail-soft vision path.

## UI12. Design system (Tailwind theme tokens)

- **UI12.1** THE system SHALL define the screenshot palette as Tailwind v4 theme
  tokens in `globals.css` via `@theme`: an off-white app background, a dark green
  for links/success, a near-black for the primary button, an amber for warnings,
  and a red for expired; plus the card/chip surface colors shown.
- **UI12.2** Cards and chips SHALL use the rounded shapes and spacing shown; the
  type SHALL be a clean sans-serif; the primary button SHALL be full-width and
  near-black with white text.
- **UI12.3** Every interactive control SHALL have a touch target of at least 44 px.
- **UI12.4** Text and essential UI SHALL meet WCAG AA contrast (4.5:1 body text,
  3:1 large text/icons); the amber and red states SHALL pair color with text/icon
  so meaning is not color-only.
- **UI12.5** Icon-only buttons (pencil, stepper − / +, close, camera) SHALL carry
  accessible names via `aria-label` or visually-hidden text.
- **UI12.6** THE system SHALL NOT add a UI component library and SHALL NOT add
  animations beyond simple state changes (product rule 6 remains).

## UI13. Save pipeline, repository, and data (`src/lib/items`, `src/lib/db`, `/api/items`)

- **UI13.1** THE system SHALL define an `ItemBatch` type and `itemBatchSchema`
  (zod), and `POST /api/items` SHALL zod-validate the body before persisting
  (R11.2/R11.3: reject empty name or quantity outside 1..999).
- **UI13.2** `POST /api/items` SHALL require a valid session (middleware already
  guards `/api/items`), compute `received_on` in `CAMPUS_TZ`, stamp `CAMPUS_ID`,
  compute `arrived_expired`, persist the batch + its `intake_read`, and return the
  saved batch including `id` and `edited_fields` (R11.5–R11.7, R11.9).
- **UI13.3** THE client SHALL send an idempotency key with each save; a repeat key
  SHALL return the existing batch, not a duplicate (R11.10).
- **UI13.4** WHEN `dont_track` or `doesnt_expire` is true THE persisted
  `expires_on` SHALL be null (R11.4/P6).
- **UI13.5** THE system SHALL define an `ItemRepository` interface with
  `saveBatch`, `listBatches(campusId, since)`, plus correction methods
  `getCorrection(key)` and `saveCorrection(key, values)`; a `MemoryRepository`
  SHALL implement it (seeded with fake Campus A data) and SHALL be selected now; the
  Supabase repository is a later task.
- **UI13.6** `GET /api/items?since=today` SHALL return this campus's batches
  received today, for the totals and the `/intake/today` list (R12.1).
- **UI13.7** THE Supabase migration (`supabase/migrations/001_items.sql`, not
  executed by the build) SHALL gain a `product_corrections` table (campus-scoped
  key → corrected name/brand/category, timestamps) with RLS enabled, alongside the
  existing `items` and `intake_reads` (R13.7).
- **UI13.8** THE memory repository is per-instance and non-persistent; totals and
  remembered fixes on the deployed demo SHALL therefore require Supabase, which is
  the next task after this one (flagged, not built here).

## UI14. Vision call tuning (carry-over changes)

- **UI14.1** THE read-label route SHALL log the **elapsed wall-clock time** of each
  provider call to the server console, alongside the existing token-usage log.
- **UI14.2** THE read-label timeout `READ_TIMEOUT_MS` SHALL be raised to 25 s
  (25_000), to accommodate slower models.
- **UI14.3** THE default `VISION_MODEL` SHALL be `gemini-3.5-flash-lite` in code
  (the provider default) and in `.env.example`, matching the deployed choice.
- **UI14.4** THE date-only re-photograph path (UI7.5) SHALL reuse the same
  provider, timeout, retry, and fail-soft behavior, with a date-only prompt and a
  response constrained to the date fields.

## UI15. Preserved behavior (must not regress)

- **UI15.1** `date_source`, `edited_fields`, `arrived_expired`, the server-side date
  re-check (R5.13), idempotency keys, and fail-soft vision behavior SHALL all be
  preserved.
- **UI15.2** Deleting `src/app/intake` and `src/components` SHALL leave all
  `src/lib` tests passing (R1.3/R18.5).
- **UI15.3** No secrets SHALL reach the client; no `NEXT_PUBLIC_` key (R14.1). The
  photo SHALL NOT be persisted (R14.4).

## UI16. Tests (Vitest + fast-check, mock provider only)

- **UI16.1** THE system SHALL test that a product correction is applied to a
  matching later read (name/brand/category prefilled) and that it is keyed
  case-insensitively.
- **UI16.2** THE system SHALL test that corrections **never** carry date values:
  applying a correction leaves all date fields as the current read's, and no date is
  written to the correction store.
- **UI16.3** THE system SHALL test the "Save without a date" path persists
  `expires_on = null` (P6-style).
- **UI16.4** THE system SHALL test the totals math: before + added = after, including
  the first-batch (before = 0) case, grouping by the normalized product key.
- **UI16.5** THE system SHALL test the state machine never reaches `saving` without
  `CONFIRM_SAVE` and never saves an unresolved ambiguous date (P8-style).
- **UI16.6** THE system SHALL test the expiry-status function (expired/today/soon/
  ok/none and the 7-day boundary) and the double-submit idempotency (same key →
  existing batch).
- **UI16.7** Tests SHALL use the mock provider only; none SHALL hit the network or
  the real AI, and there SHALL be no visual/snapshot tests for the UI (R15.11).

---

## Open questions

_None blocking._ Assumptions recorded above where the screenshots left a detail
implicit: unit pluralization defaults to "items"; the `soon` amber threshold is
≤ 7 days; the correction/totals key is normalized name + brand; the date overlay is
a graceful stretch gated on Gemini returning a plausible box.
