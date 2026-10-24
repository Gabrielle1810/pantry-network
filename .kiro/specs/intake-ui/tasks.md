# Tasks — Intake UI

Each task is small, lists the requirement IDs it covers, and includes its own tests
(mock provider only; no network, no real AI — UI16.7). Ordered so logic (`src/lib`)
lands and is tested before the components that render it, keeping the UI thin and
deletable (UI1.2/UI15.2).

**Legend**
- 🔴 Required for the designed flow to work end to end.
- 🟡 Stretch / nice-to-have; the flow works without it.
- 🔐 Needs your login or spends money; I will ask first.

> Depends on the shipped recognition slice (`/api/vision/read-label`, `src/lib/vision`,
> `src/lib/image`, `src/lib/dates`, `src/lib/items/taxonomy`, `src/lib/auth`). The
> `MemoryRepository` is used now; **Supabase is the next task after this spec** and is
> required for totals and remembered fixes to persist on Vercel (UI13.8).

---

## Phase A — Vision tuning + shared logic (no UI yet)

### Task A1 — Vision call tuning 🔴
- Raise `READ_TIMEOUT_MS` to 25_000 (UI14.2).
- Log elapsed wall-clock ms of each provider call next to token usage (UI14.1).
- Make `gemini-3.5-flash-lite` the default `VISION_MODEL` in the Gemini provider and
  in `.env.example` (UI14.3). Update tech.md's model note.
- **Tests:** none new (timeout/logging are operational); covered indirectly later.
- **Requirements:** UI14.1–UI14.3.

### Task A2 — Dates additions (`src/lib/dates`) 🔴
- Add `todayInTz(tz)` (ISO date in CAMPUS_TZ via `Intl.DateTimeFormat`, never UTC)
  and `daysUntil(iso, todayIso)`. Keep existing `detectAmbiguity`/`spellOut`/`toISO`.
- **Tests:** `daysUntil` across month/year boundaries; `todayInTz` returns a valid
  ISO for a couple of zones (deterministic via injected clock where practical).
- **Requirements:** R7.7 (partial), UI6 (support), UI4.9 (support).

### Task A3 — Expiry status (`src/lib/expiry`) 🔴
- `expiryStatus(expiresOn, todayIso)` → `{ status, days }` (expired/today/soon/ok/
  none; soon = 1..7) and `expiryChip(status, days)` → `{ text, tone }` (UI6).
- **Tests (UI16.6):** each status, the 7-day boundary (7 → soon, 8 → ok), 0 → today,
  past → expired, null → none.
- **Requirements:** UI6.1–UI6.3.

### Task A4 — Items model (`src/lib/items`) 🔴
- `ItemBatch` type + `itemBatchSchema` (zod) + `computeArrivedExpired`; `category_group`
  from taxonomy. (Advances base-spec Task 5's model piece.)
- **Tests:** name+quantity acceptance/rejection (1..999); `arrived_expired` true iff
  non-null and before `received_on`.
- **Requirements:** UI13.1 (model), R11.3, R11.9.

### Task A5 — Corrections (`src/lib/corrections`) 🔴
- `correctionKey(name, brand)` (lower/trim/collapse), `diffCorrection(original, draft)`
  (name/brand/category only, never dates), `applyCorrection(draft, c)` (prefill, flag
  remembered, no date touch).
- **Tests (UI16.1/UI16.2):** correction applied on a matching key; key
  case-insensitive; `diffCorrection` never returns a date; `applyCorrection` leaves
  all date fields unchanged.
- **Requirements:** UI9.1–UI9.5.

### Task A6 — Totals (`src/lib/totals`) 🔴
- `inventoryTotals(existing, key, added)` → `{ before, added, after, firstBatch }`.
- **Tests (UI16.4):** before+added=after; first-batch (before 0 → firstBatch true);
  grouping by normalized key ignores unrelated products.
- **Requirements:** UI10.2–UI10.4, UI10.6.

---

## Phase B — Repository + save pipeline

### Task B1 — Repository + MemoryRepository (`src/lib/db`) 🔴
- `ItemRepository` interface (saveBatch idempotent, listBatches, getCorrection,
  saveCorrection); `MemoryRepository` seeded with fake Campus A data; `getRepository`
  selector (Supabase when both env vars set, else memory).
- **Tests (UI16.6):** save then list; double-submit same idempotency key → existing
  batch (no duplicate); get/saveCorrection round-trip; `since=today` filters by tz.
- **Requirements:** UI13.5, UI13.6, R11.10, R13.5.

### Task B2 — Items routes (`POST`/`GET /api/items`) 🔴
- `POST /api/items`: session (middleware), zod-validate, compute `received_on`
  (CAMPUS_TZ) + `arrived_expired`, idempotent save, record correction when
  name/brand/category edited, return `{ batch, totals, remembered, repository }`.
- `GET /api/items?since=today`.
- **Tests (UI16.3):** "save without a date" persists `expires_on=null`; invalid batch
  → 400; correction written only when those fields changed and never with a date.
- **Requirements:** UI13.2–UI13.4, UI13.6, R11.4–R11.7, R11.9, R11.10.

### Task B3 — product_corrections migration 🔴 (not executed)
- Add `product_corrections` to `supabase/migrations/001_items.sql` (campus-scoped
  key → corrected name/brand/category, unique per campus, RLS on). Do not run it.
- **Tests:** none (SQL).
- **Requirements:** UI13.7.

---

## Phase C — Intake state machine

### Task C1 — State machine + ReviewDraft (`src/lib/intake`) 🔴
- States/events/reducer (UI3); `buildDraft`, `emptyDraft`, `savable`,
  `computeEditedFields`, `pluralizeUnit`, `saveButtonLabel`, `applyDateOnlyRead`.
- Wire remembered fixes (apply correction in `buildDraft`, don't count as edits).
- **Tests (UI16.5/UI16.1/UI16.2):** never `saving` without `CONFIRM_SAVE`; never saves
  unresolved ambiguous date; dont_track/doesnt_expire ⇒ null expiry; remembered fix
  prefilled but not in `edited_fields`; `applyDateOnlyRead` keeps name/brand/qty.
- **Requirements:** UI3, UI4, UI7.5, UI9.2/UI9.4, UI11.1.

---

## Phase D — Design system + components

### Task D1 — Design tokens + globals (`globals.css` `@theme`) 🔴
- Define the screenshot palette as Tailwind v4 theme tokens; base typography; verify
  the hexes against the screenshots and adjust to pass WCAG AA on each pairing.
- Shared primitives: `Chip`, `IconButton` (accessible name required), `Stepper`.
- **Tests:** none (visual); a11y names covered by component usage.
- **Requirements:** UI12.1–UI12.6.

### Task D2 — Capture screen + viewfinder (`src/components/intake`, `/intake`) 🔴
- `/intake` hosts the machine. `CaptureScreen` + `Viewfinder` (getUserMedia rear
  camera, corner brackets) with `<input capture>` fallback on denied permission;
  shutter; "Type it instead"; "Reading the label…" frozen state; prepareImage before
  upload (UI2).
- **Tests:** none (browser/UI, UI16.7); logic is in the machine.
- **Requirements:** UI2.1–UI2.9, UI3.3–UI3.5.

### Task D3 — Review screen: date-found + no-date + full form 🔴
- `ReviewScreen`: photo + green-check/amber-"?" badge, title "{name} · {brand}" with
  pencil inline edit, `ExpiryChip`, `CategoryChip`, `DateRow` (label by date_type +
  Edit), `Stepper`, primary "Save {n} {unit}" / "Save without a date", "Edit all
  details" → `FullDetailsForm`. No-date path + "Photograph the date instead" (date-only
  re-photo). Unreadable variant (empty name, focus name).
- **Tests:** none (UI); all decisions in `src/lib`.
- **Requirements:** UI5, UI6.3, UI7, UI8, UI11.1–UI11.2.

### Task D4 — Saved screen + totals + /intake/today 🔴
- `SavedScreen`: green-tinted card, "+{n} {unit}" pill, green check, "Saved to
  Inventory", totals sentence (before+added=after / "{n} added"), "Add another item"
  row, "Finish" → `/intake/today`. `/intake/today` list (batches, edited_fields,
  active repository).
- **Tests:** none (UI); totals math tested in A6/B2.
- **Requirements:** UI10, UI12.2, R12.2–R12.4.

### Task D5 — Error + ambiguous + non-food states 🔴
- `AmbiguousDateChoice` (two spelled-out buttons, month-first first, + Keep Unknown);
  non-food "Doesn't expire" chip (no date row); `ErrorScreen` (message + Retry).
- **Tests:** none (UI); machine invariants tested in C1.
- **Requirements:** UI11.

---

## Phase E — Stretch + docs + ship

### Task E1 — Date bounding-box overlay 🟡 (stretch)
- Add optional `date_box` to `LabelRead` + prompt for it; UI scales it to the photo
  and draws a green outline; omit silently if null/implausible; never blocks the read
  (UI5.10). Verified feasible against current Gemini object-detection docs.
- **Tests:** a unit test that an absent/implausible box yields no overlay geometry.
- **Requirements:** UI5.10.

### Task E2 — Docs: product.md rule 10, specs, README 🔴
- product.md rule 10: record that the four screenshots are the visual spec for the
  Intake screens (other rules unchanged) (UI1.3). Note the change in the base intake
  spec. README: new `/api/items` contract + the Gemini model/timeout change + the
  "totals & fixes need Supabase to persist" caveat.
- **Requirements:** UI1.3, UI13.8, R17.2/R17.3 (partial).

### Task E3 — Verify, commit, push 🔴
- `npm run build` + `npm test` + `npm run lint` green; confirm deleting
  `src/app/intake` + `src/components/intake` leaves `src/lib` tests passing (UI15.2).
- Commit and push to `main` (auto-deploys to Vercel). Then give you the phone test
  script.
- **Requirements:** UI15.

---

## What needs you / what to flag
- **No 🔐 steps in this spec.** All tasks are local code; Vercel auto-deploys on push.
- **Supabase is the NEXT spec/task** (after this), and is **required** for totals and
  remembered fixes to persist on the deployed demo — the `MemoryRepository` resets per
  serverless instance (UI13.8). I'll flag this again in the final summary.

## Demo-critical path
Phases A → B → C → D are required for the full flow. Phase E1 (date overlay) is
cuttable. Phase E2/E3 (docs + ship) close it out.
```
