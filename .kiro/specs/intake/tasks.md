# Tasks — Pantry Network, Module 1 (Intake)

Each task is small, lists the requirement IDs it satisfies, and includes its own tests (no separate test task). Ordered for an early working end-to-end slice and a live deployment, per review round 2.

**Legend**
- 🔴 **Required for demo** — the acceptance criteria (R18) depend on it.
- 🟡 **Cuttable** — valuable, but the demo still works without it if time runs out.
- 🔐 **Needs you** — a step that requires your login or spends money; I will ask before running it (R17.5, R17.6).

Tests use Vitest + fast-check, mock provider only; no test hits the network or the real AI (R15).

---

## Phase 1 — Scaffolding + repo + hooks

### Task 1 — Project scaffold, .gitignore, README stub, GitHub repo 🔴 🔐
- Create the Next.js (App Router) + TypeScript + Tailwind app at the workspace root; phone-first base layout; `/` redirects to `/intake`.
- Add Vitest + fast-check config and a trivial passing test so `npm test` works.
- `.gitignore` for `node_modules`, `.next`, `.env*`, `.vercel`; **never** `.kiro`.
- `README.md` stub (what it is, sample-data note, placeholder for setup/env/tests), MIT `LICENSE`, `.env.example` with `ANTHROPIC_API_KEY`, `VISION_PROVIDER`, `VISION_MODEL`, `STAFF_PIN`, `SESSION_SECRET`, `CAMPUS_ID`, `CAMPUS_TZ`, and commented `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- `git init`, first commit.
- 🔐 Detect the GitHub CLI; if installed and authenticated, **ask you**, then run `gh repo create pantry-network --public --source=. --push`. Otherwise print the exact manual commands.
- **Tests:** scaffold smoke test (app builds, trivial test passes).
- **Requirements:** R1.1, R1.2, R1.4, R1.6, R14.2, R17.1, R17.2 (stub), R17.5.

### Task 2 — Agent hooks 🔴
- Placed right after scaffolding so they run during the whole build; their effect on our workflow goes into the Kiro write-up.
- Hook 1: run related tests when `src/lib/dates/**` or `src/lib/vision/**` is saved.
- Hook 2: when `.gitignore` is saved, warn if `.kiro` is ignored.
- Hook 3: when any file is saved, scan for API-key-looking strings and `NEXT_PUBLIC_` secrets and warn.
- **Tests:** none (hook definitions); verified by triggering saves during later tasks.
- **Requirements:** R16.1–R16.3.

---

## Phase 2 — Auth + first deploy

### Task 3 — PIN gate + session (`src/lib/auth`, `/api/session`, `/pin`, middleware) 🔴
- `src/lib/auth`: `checkPin` (constant-time), `signSession`/`verifySession` (HMAC with `SESSION_SECRET`, 12h exp), cookie constants.
- `POST /api/session` (set cookie on valid PIN, 401 otherwise), `DELETE /api/session` (logout).
- Middleware/guard: protect intake pages (redirect to `/pin`) and protected APIs (401).
- Plain `/pin` page posting to `/api/session`.
- **Tests (unit):** right PIN → token verifies; wrong PIN → 401, no cookie; tampered/expired token rejected; constant-time path exercised. (R15.10 PIN-gate unit.)
- **Requirements:** R2.1–R2.8, R14.1.

### Task 4 — First Vercel deploy of the bare app 🔴 🔐
- Ensure the app builds for Vercel (Next.js preset, no server-only import leaks to client).
- Provide the **exact** deploy steps for you to run the login parts: import the GitHub repo, framework preset Next.js, add env vars (`STAFF_PIN`, `SESSION_SECRET`, `VISION_PROVIDER=mock` for now, `VISION_MODEL`, `CAMPUS_ID`, `CAMPUS_TZ`), deploy, open the HTTPS URL on a phone, confirm `/pin` works.
- At this point the live app gates on the PIN; capture/review come next.
- **Tests:** none new (deploy step).
- **Requirements:** R1.1, R17.4 (partial), R17.6.

---

## Phase 3 — End-to-end slice (mock provider + MemoryRepository)

### Task 5 — Taxonomy + items model (`src/lib/items`) 🔴
- `taxonomy.ts` (groups/values, `CATEGORY_GROUP`, `normalizeCategory` case-insensitive → value | "Uncategorized").
- `ItemBatch` type + `itemBatchSchema` (zod); `computeArrivedExpired`.
- **Tests:** P5 category normalization; P9 `arrived_expired` true iff `expires_on` non-null and before `received_on`; P3 name+quantity acceptance/rejection (quantity 1..999).
- **Requirements:** R10.2, R10.3, R11.3, R11.9, R15.3 (P3), R15.5 (P5), R15.9 (P9).

### Task 6 — Dates module (`src/lib/dates`) 🔴
- `toISO`/`parseISO`, `detectAmbiguity` (month-first candidate first), `spellOut`, month→last-day, `todayInTz`/`isoBefore` in `CAMPUS_TZ`.
- **Tests:** P1 round-trip; P2 ambiguity flagged + never auto-resolved; P7 month-only → last day.
- **Requirements:** R7.1–R7.7, R15.1 (P1), R15.2 (P2, pure-date part), R15.7 (P7).

### Task 7 — Vision contract + mock provider (`src/lib/vision`) 🔴
- `LabelRead` zod schema + JSON Schema export; `VisionProvider` interface; `MockVisionProvider` with deterministic fixtures (readable can, unreadable, ambiguous date, non-food/doesnt_expire, month-only); `getVisionProvider` (mock when no key, startup warning).
- `SYSTEM_PROMPT` constant (verbatim brief), taxonomy list generated from `taxonomy.ts`.
- **Tests:** mock returns schema-valid fixtures; `getVisionProvider` falls back to mock with no key; prompt's taxonomy matches `taxonomy.ts`.
- **Requirements:** R6.1–R6.4, R6.11, R6.12, R6.14, R10.1.

### Task 8 — Image prep (`src/lib/image`) 🔴
- Split so the logic is testable in Node (the canvas API does not exist in Vitest's Node environment):
  - **Pure, tested:** `computeTargetDimensions(w, h)` (longest side ≤ 1280 px, preserve aspect) and `isWithinUploadLimit(bytes)` / the 2 MB size check.
  - **Thin browser-only wrapper:** `prepareImage(file)` that uses the pure function for dimensions, draws to `<canvas>`, exports JPEG q≈0.8 (strips metadata), returns base64 + bytes with one quality step-down if > 2 MB. Verified manually on a phone, not unit-tested.
- **Tests (unit):** `computeTargetDimensions` downscales oversized inputs and preserves aspect ratio; `isWithinUploadLimit` accepts ≤ 2 MB and rejects above (image-size rejection, R15.10). No canvas in tests.
- **Requirements:** R4.1–R4.6.

### Task 9 — read-label route on mock (`POST /api/vision/read-label`) 🔴
- Cookie check; validate JPEG + ≤ 2 MB; call provider via mock; zod-validate; return `{ status, provider, read? }`; 15s timeout wrapper; fail-soft to `unreadable`.
- (Server-side date re-check and the real Anthropic call come in Phase 4; mock path first.)
- **Tests:** valid fixture → `status:"ok", provider:"mock"`; schema-fail fixture → `status:"unreadable"` (P4, never throws); oversized/non-JPEG → 400; no cookie → 401.
- **Requirements:** R5.1–R5.9 (mock path), R5.12, R15.4 (P4).

### Task 10 — Intake state machine + ReviewDraft (`src/lib/intake`) 🔴
- States/events/reducer; `buildDraft`; invariants (no `saving` without confirm; no unchosen-ambiguous save; dont_track/doesnt_expire → null date); `computeEditedFields`; `date_source` photo/typed.
- **Tests:** P8 (no `saving` without confirm; never saves unchosen ambiguous date) over arbitrary event sequences; P6 (dont_track/doesnt_expire → null expiry); unit: `edited_fields` calculation.
- **Requirements:** R8.1–R8.16, R15.6 (P6), R15.8 (P8), R15.10 (edited_fields unit).

### Task 11 — MemoryRepository + items routes (`src/lib/db`, `POST`/`GET /api/items`) 🔴
- `ItemRepository` interface; `MemoryRepository` seeded with fake Campus A data + idempotency map; `getRepository` selector; `POST /api/items` (zod, compute `arrived_expired` + `received_on` in `CAMPUS_TZ`, idempotent save) and `GET /api/items?since=today`.
- **Tests (unit):** save then list returns the batch; double-submit with same idempotency key returns the existing batch, no duplicate; `since=today` filters by campus tz.
- **Requirements:** R11.1–R11.10, R12.1, R13.1, R13.2, R13.5, R15.10 (double-submit unit).

### Task 12 — Placeholder UI wiring + `/intake/today` 🔴
- `/intake` page: capture button, calls `prepareImage` → read-label → machine → review form (name, expiry/Unknown, two labelled ambiguous choices, don't-track, quantity, category, source, Retake/Save). Save → confirmation → back to capture. "Demo mode: sample reads" banner when `provider:"mock"`.
- `/intake/today` list page showing batches, `edited_fields`, and the active repository name.
- Uses product.md copy. No business logic in components (deleting them keeps lib tests green).
- **Tests:** none (no visual/snapshot tests for placeholder UI, R15.11); covered indirectly by lib tests.
- **Requirements:** R3.1–R3.3, R9.1–R9.5, R12.2–R12.4, R18.5.

> **End of Phase 3 = working end-to-end demo on mock + memory, locally and (after a redeploy) on Vercel.**

---

## Phase 4 — Real AI

### Task 13 — Anthropic provider + server-side date re-check + fail-soft 🔴
- `AnthropicVisionProvider` using `@anthropic-ai/sdk`: `output_config.effort:"low"` + `output_config.format` json_schema; image base64 block; no temperature/top_p/top_k; no prefill; handle `stop_reason` refusal/max_tokens → unreadable; log input/output tokens; 15s timeout; one network retry.
- Wire read-label to re-run `src/lib/dates` ambiguity on `date_raw` and override an AI-resolved ambiguous date (`expires_on=null`, candidates set).
- **Tests:** P2 extended — an AI fixture that auto-resolved an ambiguous date is overridden back to null+candidates by the server re-check (uses a mock returning that shape; never calls the real API). Refusal/max_tokens fixtures → unreadable.
- **Requirements:** R5.10, R5.11, R5.13, R6.5–R6.10, R15.2 (P2 AI-resolved path).

### Task 14 — Redeploy with Anthropic on Vercel 🔴 🔐
- 🔐 You add `ANTHROPIC_API_KEY` and set `VISION_PROVIDER=anthropic` in Vercel, then redeploy. I provide exact steps.
- Required: image recognition is the core of the project and the demo must use real reads, not the mock.
- **Manual accuracy check (for the write-up):** photograph 5–10 real items through the live app, and for each record how many fields needed editing (read from `edited_fields` on the saved batch). Note the total edit rate.
- The mock remains a fallback only if the key fails mid-demo (R18.6), but the intended demo path is real Anthropic.
- **Requirements:** R6.3, R18.1, R18.6.

---

## Phase 5 — Persistence for the deployed demo

### Task 15 — Supabase migration + SupabaseRepository 🔴
- `supabase/migrations/001_items.sql` (items + intake_reads, checks/defaults, `arrived_expired`, partial unique index on `(campus_id, idempotency_key)`, RLS enabled with the policies-later comment). Do **not** run it.
- `SupabaseRepository` (server-only, service-role key): insert items + intake_reads; on `23505` against the unique index, return the existing row and skip the intake_reads insert.
- **Tests (unit):** repository selector returns Supabase only when both env vars set (logic tested without a live DB; the Supabase client is stubbed). MemoryRepository remains the tested behavioral reference for idempotency.
- **Requirements:** R11.10, R13.3, R13.4, R13.6, R13.7.

### Task 16 — Redeploy using Supabase (demo persistence) 🔴 🔐
- 🔐 You create a Supabase project, run `001_items.sql` in its SQL editor, add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to Vercel, redeploy. I provide exact steps.
- Verify `/intake/today` shows `repository: "supabase"` and a save survives a reload.
- **Requirements:** R13.6, R18.4.

---

## Phase 6 — Docs + acceptance

### Task 17 — DEPLOY.md + README API contract + env docs 🔴
- `DEPLOY.md`: Vercel import, Next.js preset, env vars (incl. `SESSION_SECRET`, `CAMPUS_TZ`), deploy, open HTTPS on phone, per-branch previews, and the **required** Supabase setup section (create project, run migration, add Supabase env vars).
- Finish `README.md`: what it is, sample-data note, local setup, full env var list, how to run tests, and the full API contract for `/api/session`, `/api/vision/read-label`, `/api/items`.
- **Requirements:** R17.2 (final), R17.3, R17.4.

### Task 18 — Final acceptance pass 🔴
- Run the whole suite green; confirm deleting `src/app/intake` + `src/components` leaves lib tests passing (R18.5); confirm no secrets committed and `.kiro` is present; walk the acceptance script (PIN → capture → review → save → today) on real Anthropic (mock as fallback).
- **Requirements:** R18.1–R18.7.

---

## Demo-critical path

Required (🔴): Tasks 1–18 except Task 2 hooks are also required now. Every task except none is cuttable — the only 🟡 remaining is nothing; see below.

Cuttable (🟡): none. (Task 14 real-AI redeploy and Task 2 hooks were promoted to required in review round 2.)

After **Task 12** you already have a working end-to-end demo on mock + memory. **Task 14** makes the AI real (required). **Task 16** makes the deployed demo persist. If the key fails mid-demo, mock is the only fallback (R18.6), but the intended path is real Anthropic reads.
