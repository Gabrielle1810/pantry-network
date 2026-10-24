# Requirements — Pantry Network, Module 1 (Intake)

Format: EARS ("WHEN … THE system SHALL …", plus "WHILE", "IF … THEN", and ubiquitous "THE system SHALL" forms). Every requirement is numbered. Anything unclear is in **Open questions** at the end, not guessed.

Scope: a phone-first web page where pantry staff photograph incoming items, an AI reads each label, staff confirm or edit, and the item is saved as an inventory batch. The UI is an intentionally plain placeholder; all behavior lives in `src/lib` and the API routes.

---

## R1. Platform and shell

- **R1.1** THE system SHALL be a Next.js (App Router) application written in TypeScript and styled with Tailwind CSS, deployable on Vercel (Hobby plan).
- **R1.2** THE system SHALL render all staff-facing pages usable on a 390 px wide phone viewport.
- **R1.3** THE system SHALL keep all business logic (draft building, date handling, validation, edited-field tracking, the intake state machine, repositories, vision providers) in `src/lib` and the API routes, such that deleting `src/app/intake` and `src/components` leaves every `src/lib` test passing.
- **R1.4** WHEN a visitor requests the root path `/` THE system SHALL redirect to the intake entry point.
- **R1.5** THE system SHALL read the campus identifier from env var `CAMPUS_ID` and SHALL default to `"campus-a"` when it is unset.
- **R1.6** THE system SHALL use Tailwind minimally with basic HTML elements, no UI component library, no custom visual design, and no animations in this module.

## R2. Staff access gate (PIN)

- **R2.1** THE system SHALL present a `/pin` page with a single PIN input and a submit control.
- **R2.2** WHEN staff submit a PIN THE system SHALL compare it on the server against env var `STAFF_PIN`.
- **R2.3** IF the submitted PIN matches `STAFF_PIN` THEN THE system SHALL set an `httpOnly`, `secure`, `sameSite` session cookie carrying a signed stateless HMAC token (signed with env var `SESSION_SECRET`, independent of `STAFF_PIN`) that is valid for 12 hours, and SHALL return success.
- **R2.3a** THE system SHALL sign the session token with `SESSION_SECRET` and SHALL NOT derive the signing key from `STAFF_PIN` (the PIN may be shared publicly with testers).
- **R2.4** IF the submitted PIN does not match `STAFF_PIN` THEN THE system SHALL reject the request with an unauthorized status and SHALL NOT set a session cookie.
- **R2.5** THE system SHALL compare the PIN using a constant-time comparison to avoid timing leaks.
- **R2.6** WHEN any intake page or protected API route is requested without a valid session cookie THE system SHALL deny access (redirect pages to `/pin`; return `401` for APIs).
- **R2.6a** THE system SHALL expose `POST /api/session` to check the PIN and set the cookie, and `DELETE /api/session` to log out (clear the cookie); `/pin` is the page that calls them.
- **R2.7** THE system SHALL NOT support user accounts in this module; the PIN is the only gate.
- **R2.8** THE system SHALL never expose `STAFF_PIN` or the session secret to client code or any `NEXT_PUBLIC_` variable.

## R3. Photo capture (placeholder UI)

- **R3.1** THE system SHALL offer one capture control implemented as `<input type="file" accept="image/*" capture="environment">`, opening the phone's own camera.
- **R3.2** THE system SHALL NOT implement a live in-page viewfinder in this module.
- **R3.3** THE system SHALL show the camera hint copy from product.md: "Show the item's name and the date on its label."

## R4. In-browser image preparation

- **R4.1** WHEN staff select or capture a photo THE system SHALL resize it in the browser so the longest side is at most 1280 px.
- **R4.2** THE system SHALL re-encode the resized photo as JPEG at quality approximately 0.8.
- **R4.3** THE system SHALL upload only the re-encoded JPEG and SHALL NEVER upload the original file.
- **R4.4** THE system SHALL perform re-encoding through a canvas so that location and other metadata are stripped.
- **R4.5** THE system SHALL place all image preparation code in `src/lib/image` so any future frontend can reuse it.
- **R4.6** THE system SHALL aim for a prepared image under 1 MB and SHALL keep it within the vision endpoint's 2 MB limit (R5.3).

## R5. Vision read endpoint — `POST /api/vision/read-label`

- **R5.1** WHEN `POST /api/vision/read-label` is called THE system SHALL require a valid session cookie and SHALL return `401` if it is absent or invalid.
- **R5.2** THE system SHALL validate that the uploaded payload is a JPEG image.
- **R5.3** IF the uploaded image exceeds 2 MB THEN THE system SHALL reject it before calling the vision provider.
- **R5.4** WHEN the image is valid THE system SHALL call the configured vision provider's `readLabel` method with the image as base64 JPEG.
- **R5.5** THE system SHALL enforce a 15 second timeout on the vision provider call.
- **R5.6** THE system SHALL validate the provider's response against the `LabelRead` zod schema (R10).
- **R5.7** IF the provider call fails, times out, is refused, or returns output that fails schema validation THEN THE system SHALL respond with HTTP 200 and body `{ "status": "unreadable" }`.
- **R5.8** WHEN the provider returns schema-valid output THE system SHALL respond with HTTP 200 and body `{ "status": "ok", "read": <LabelRead>, "provider": "anthropic" | "mock" }`.
- **R5.8a** WHEN the responding provider is `mock` THE system SHALL indicate this in the response (`provider: "mock"`) so the UI can show "Demo mode: sample reads".
- **R5.13** WHEN the AI returns an `expires_on` THE system SHALL re-run `src/lib/dates` ambiguity detection on `date_raw`; IF the AI auto-resolved a date that is in fact ambiguous THEN THE system SHALL override it (`expires_on = null`, `date_ambiguous = true`, both ISO candidates populated) before returning the read. (See R7.3, P2.)
- **R5.9** THE system SHALL NEVER return HTTP 500 to the phone for a vision problem (fail soft).
- **R5.10** THE system SHALL retry the provider call at most once, and only on a network error.
- **R5.11** THE system SHALL log the input and output token counts of each provider call to the server console.
- **R5.12** THE system SHALL call the vision provider only from server code, never from the browser.

## R6. Vision provider abstraction

> **Provider update (plan change):** the active provider is now **Gemini** (`@google/genai`, model `gemini-3.8-flash`), chosen for its free tier so real phone testing can happen immediately. The Anthropic provider is implemented and kept for later but inactive. The requirements below are provider-neutral except where a provider's API shape is named; the Anthropic-specific mechanics (R6.6a–R6.9) still apply when `VISION_PROVIDER=anthropic`.

- **R6.1** THE system SHALL define an interface `VisionProvider` with a single method `readLabel(imageJpegBase64: string): Promise<LabelRead>`.
- **R6.2** THE system SHALL provide a `gemini` provider, an `anthropic` provider, and a `mock` provider.
- **R6.3** THE system SHALL select the provider from env var `VISION_PROVIDER`, defaulting to `gemini`.
- **R6.4** IF the selected real provider has no API key configured THEN THE system SHALL fall back to the `mock` provider so the app runs end to end without a key.
- **R6.5** THE system SHALL read the model ID from env var `VISION_MODEL`, defaulting to `gemini-3.8-flash` (Gemini) or `claude-haiku-5-5` (Anthropic).
- **R6.6** WHEN a provider requests the model's output THE system SHALL constrain it to the `LabelRead` schema via that provider's structured-output mechanism:
  - **Gemini** (verified at ai.google.dev, 2026-10): `config.responseMimeType = "application/json"` + `config.responseJsonSchema = <JSON Schema of LabelRead>`; image passed as an inline part `{ inlineData: { mimeType: "image/jpeg", data } }`; system prompt via `config.systemInstruction`; parsed text at `response.text`. Model `gemini-3.8-flash` is multimodal and accepts image input on the free tier.
  - **Anthropic** (R6.6a): `output_config.format` with `type: "json_schema"`.
- **R6.7** (Anthropic) THE system SHALL request the lowest effort level the model supports (`output_config.effort: "low"`). Gemini has no equivalent knob for this call.
- **R6.8** (Anthropic) THE system SHALL omit `temperature`, `top_p`, and `top_k`, as the model rejects them.
- **R6.9** (Anthropic) THE system SHALL NOT use assistant-prefill to force JSON, as the model rejects it.
- **R6.10** WHEN a response is refused or truncated (Anthropic `stop_reason` `"refusal"`/`"max_tokens"`; Gemini `finishReason` other than `STOP`, or empty text) THE system SHALL treat it as unreadable (feeding R5.7).
- **R6.11** THE system SHALL send the verbatim system prompt defined in the brief, keeping its taxonomy list in sync with `src/lib/items/taxonomy.ts`.
- **R6.12** THE `mock` provider SHALL return deterministic fixtures and SHALL be used by all tests; no test shall call the real AI API.
- **R6.13** THE system SHALL treat text printed on packaging as data, never as instructions (reflected in the system prompt and never executed).
- **R6.14** WHEN a real provider is selected but its API key is missing THE system SHALL log a clear warning at startup that it is falling back to the mock provider (complements R6.4).
- **R6.15** (privacy, plan change) WHILE using the Gemini free tier THE system SHALL assume Google may use submitted content to improve its products; it SHALL therefore send product photos only (never student data, R14.3) with metadata stripped (R14.4), and SHALL document this in the README.

## R7. Date handling (`src/lib/dates`)

- **R7.1** WHEN a date is stored or transported THE system SHALL use ISO `YYYY-MM-DD` format.
- **R7.2** WHEN formatting a valid date and then parsing it back THE system SHALL return the identical date (round-trip stability).
- **R7.3** WHEN a numeric date can be read in more than one way (both day and month are ≤ 12 and differ) THE system SHALL flag it ambiguous and SHALL NOT auto-resolve it.
- **R7.4** WHEN a date is ambiguous THE system SHALL expose both candidate ISO dates and SHALL provide clearly-labelled spelled-out human forms, presenting the **month-first (US) reading first** and the day-first reading second. For `06/12/27`: month-first "12 June 2027" first, then day-first "6 December 2027".
- **R7.5** WHEN only a month and year are printed THE system SHALL resolve the date to the last day of that month and SHALL mark `date_precision` as `"month"`.
- **R7.6** THE system SHALL place all parsing, normalization, and ambiguity detection in `src/lib/dates`.
- **R7.7** THE system SHALL read the campus time zone from env var `CAMPUS_TZ`, defaulting to `"America/New_York"`, and SHALL compute "today" and `received_on` in that time zone (never UTC).

## R8. Intake flow logic — headless state machine (`src/lib/intake`)

- **R8.1** THE system SHALL implement a headless state machine with states: `idle`, `reading`, `review`, `saving`, `saved`.
- **R8.2** WHEN a vision read returns `unreadable` THE system SHALL enter `review` with empty/default fields and a "date not found" message.
- **R8.3** WHEN any error occurs during the flow THE system SHALL enter `review` carrying a human-readable message.
- **R8.4** THE system SHALL transform a `LabelRead` into a `ReviewDraft` independently of any UI.
- **R8.5** WHEN building the draft THE system SHALL prefill `name` from the AI read, keep it editable, and require it (non-empty) to save.
- **R8.6** WHEN the read date is unambiguous THE system SHALL prefill `expires_on`; otherwise it SHALL set `expires_on` to `null` (Unknown).
- **R8.7** WHILE a draft carries an ambiguous date THE system SHALL NOT allow it to hold an `expires_on` until staff choose one candidate or keep Unknown.
- **R8.8** WHEN `doesnt_expire` is true THE system SHALL hide the date fields and keep all date values `null`.
- **R8.9** WHEN `dont_track` is set THE system SHALL clear and disable the date fields.
- **R8.10** THE system SHALL prefill `quantity` from the AI count when present, else `1`, and SHALL accept only integers from 1 to 999.
- **R8.11** THE system SHALL prefill `category` from the AI read as a taxonomy value or `"Uncategorized"`, and SHALL keep it editable.
- **R8.12** THE system SHALL carry `date_type` through, and SHALL set `date_source` to `"photo"` when a read date is kept and `"typed"` when staff change it.
- **R8.13** THE system SHALL compute `edited_fields` by comparing the final draft against the original AI read.
- **R8.14** THE system SHALL NOT transition to `saving` without an explicit confirm action.
- **R8.15** THE system SHALL NOT save an ambiguous date that was not explicitly chosen.
- **R8.16** WHEN a save succeeds THE system SHALL enter `saved` and SHALL be ready to return to capture for the next item.

## R9. Review screen (placeholder UI)

- **R9.1** THE system SHALL render a plain form bound to the `ReviewDraft` with: name, expiry date (or Unknown), the two ambiguous-date choices when needed, a "don't track a date" checkbox, quantity, category, delivery source (Donated / Purchased / not set), and Retake / Save buttons.
- **R9.2** THE system SHALL use the placeholder copy from product.md (review title, badge, field labels, date notes, checkbox, button labels).
- **R9.3** WHEN the date is not found THE system SHALL show the "Date not found. Type it in, or leave it as Unknown and we'll ask again." note.
- **R9.3a** WHEN `expires_on` is before today (campus time zone) THE system SHALL show the note "This date has passed", SHALL still allow saving, and the draft SHALL carry `arrived_expired = true` (see R11.9).
- **R9.4** THE system SHALL use labelled inputs, real buttons, and screen-reader-usable markup (accessible basics only in this module).
- **R9.5** THE review form SHALL contain no business logic; it SHALL only render draft state and call `src/lib` functions.

## R10. LabelRead data contract

- **R10.1** THE system SHALL validate every AI response with a zod schema named `LabelRead` with fields: `name` (string|null), `brand` (string|null), `size_text` (string|null), `category` (taxonomy value | "Uncategorized"), `is_food` (boolean), `doesnt_expire` (boolean), `perishable` (boolean), `date_raw` (string|null), `date_type` ("use_by"|"best_by"|"sell_by"|"unlabeled"|"none"), `expires_on` ("YYYY-MM-DD"|null), `date_precision` ("day"|"month"|null), `date_ambiguous` (boolean), `date_candidates` (string[] of ISO dates), `quantity_visible` (integer|null), `name_confidence` (0..1), `date_confidence` (0..1), `notes` (string|null).
- **R10.2** THE system SHALL compare `category` against the taxonomy case-insensitively, since structured outputs do not guarantee enum casing.
- **R10.3** THE system SHALL treat `category` values outside the taxonomy as `"Uncategorized"`.

## R11. Save endpoint — `POST /api/items`

- **R11.1** WHEN `POST /api/items` is called THE system SHALL require a valid session cookie (R2.6).
- **R11.2** THE system SHALL validate the request body with zod before persisting.
- **R11.3** THE system SHALL reject a save whose `name` is empty or whose `quantity` is not an integer in 1..999.
- **R11.4** WHEN `dont_track` or `doesnt_expire` is true THE system SHALL persist `expires_on` as `null`.
- **R11.5** WHEN a save is valid THE system SHALL store one item batch and its associated `intake_read` record through the repository (R13).
- **R11.6** WHEN persistence succeeds THE system SHALL return the saved batch (including its id and `edited_fields`).
- **R11.7** THE system SHALL stamp each batch with the current `CAMPUS_ID` and with `received_on` computed in `CAMPUS_TZ`.
- **R11.8** THE system SHALL NOT store the photo in this module.
- **R11.9** THE system SHALL compute and persist `arrived_expired` as `true` exactly when `expires_on` is non-null and before `received_on` (both in campus time zone), else `false`.
- **R11.10** THE client SHALL send an idempotency key with each save; WHEN a save arrives with an idempotency key already seen THE system SHALL return the existing batch instead of creating a second one.

## R12. List endpoint and today page

- **R12.1** WHEN `GET /api/items?since=today` is called with a valid session THE system SHALL return the current campus's batches received today.
- **R12.2** THE system SHALL render a plain `/intake/today` page listing those batches to prove saves worked.
- **R12.3** THE `/intake/today` list SHALL display each batch's key fields and its `edited_fields`.
- **R12.4** THE `/intake/today` page SHALL display which repository is active (`"memory"` or `"supabase"`).

## R13. Data layer (`src/lib/db`)

- **R13.1** THE system SHALL define an `ItemRepository` interface with `saveBatch(...)` and `listBatches(campusId, since)`.
- **R13.2** THE system SHALL provide a `MemoryRepository` used for local development and all tests, seeded with clearly fake sample data for "Campus A".
- **R13.3** THE system SHALL provide a `SupabaseRepository` that is used whenever both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- **R13.4** THE `SupabaseRepository` SHALL run only on the server and SHALL never expose the service-role key to the client.
- **R13.5** THE system SHALL select the repository at runtime based on the presence of the Supabase env vars, with no code changes required to switch, and SHALL expose the active repository name for display (R12.4).
- **R13.6** THE deployed Vercel demo SHALL use the `SupabaseRepository`, because in-memory data does not persist reliably across serverless instances; the `MemoryRepository` is for local dev and tests only. Supabase setup SHALL be a required pre-demo step in `DEPLOY.md`.
- **R13.7** THE system SHALL provide `supabase/migrations/001_items.sql` (not executed by the build) defining `items` and `intake_reads` with the columns, checks, and defaults in the brief plus an `arrived_expired boolean default false` column and an idempotency-key column on `items`, and enabling row-level security on both with a comment that policies arrive with user accounts.

## R14. Security and privacy

- **R14.1** THE system SHALL keep all secrets in server-only environment variables and SHALL never use a `NEXT_PUBLIC_` prefix for any key.
- **R14.2** THE system SHALL never commit `.env` files; only `.env.example` with placeholder values.
- **R14.3** THE system SHALL store no student data and SHALL handle product photos only.
- **R14.4** THE system SHALL strip photo metadata before upload (via R4.4) and SHALL not persist photos.
- **R14.5** THE system SHALL use plain, warm, stigma-free language in all copy.

## R15. Tests (Vitest + fast-check, mock provider only)

- **R15.1 (P1)** For any valid date, formatting then parsing SHALL return the same date.
- **R15.2 (P2)** Any numeric date where day and month are both ≤ 12 and different SHALL be flagged ambiguous and never auto-resolved — including the path where the AI returned a resolved `expires_on`: the server's re-check SHALL override it back to `null` with both candidates (R5.13).
- **R15.3 (P3)** Any item with a non-empty name and an integer quantity in 1..999 SHALL be accepted regardless of date fields; quantities outside that range SHALL be rejected.
- **R15.4 (P4)** Any model output that fails the schema SHALL make the API return `status: "unreadable"`, never throw.
- **R15.5 (P5)** `category` SHALL always resolve to a taxonomy value or `"Uncategorized"`.
- **R15.6 (P6)** WHEN `dont_track` or `doesnt_expire` is true THE saved `expires_on` SHALL always be `null`.
- **R15.7 (P7)** A month-only date SHALL always resolve to the last day of that month.
- **R15.8 (P8)** For any sequence of intake events, the state machine SHALL never reach `saving` without an explicit confirm and SHALL never save an ambiguous date that was not chosen.
- **R15.9 (P9)** `arrived_expired` SHALL be `true` exactly when `expires_on` is non-null and before `received_on` (both in campus time zone), and `false` otherwise.
- **R15.10** THE system SHALL include unit tests for the PIN gate, image size rejection, `edited_fields` calculation, and a double-submit (same idempotency key returns the existing batch, no duplicate created).
- **R15.11** THE system SHALL NOT include visual or snapshot tests for the placeholder UI.

## R16. Agent hooks

- **R16.1** THE system SHALL create a hook that runs the related tests when a file in `src/lib/dates/` or `src/lib/vision/` is saved.
- **R16.2** THE system SHALL create a hook that, when `.gitignore` is saved, checks that `.kiro` is not ignored and warns if it is.
- **R16.3** THE system SHALL create a hook that, when any file is saved, scans it for strings that look like API keys or for `NEXT_PUBLIC_` variables holding secrets, and warns.

## R17. Repository, docs, and deployment

- **R17.1** THE system SHALL initialize a git repository with a `.gitignore` covering `node_modules`, `.next`, `.env*`, and `.vercel`, and SHALL never ignore `.kiro`.
- **R17.2** THE system SHALL include `README.md` (what it is, sample-data note, local setup, env vars, how to run tests), an MIT `LICENSE`, and `.env.example` with `ANTHROPIC_API_KEY`, `VISION_PROVIDER`, `VISION_MODEL`, `STAFF_PIN`, `SESSION_SECRET`, `CAMPUS_ID`, `CAMPUS_TZ`, and commented `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- **R17.3** THE system SHALL document the full API contract (request/response JSON for `/api/session`, `/api/vision/read-label`, `/api/items`) in both `design.md` and `README.md` so a future frontend or native app can use it unchanged.
- **R17.4** THE system SHALL include `DEPLOY.md` with step-by-step Vercel deployment (import repo, Next.js preset, add env vars including `SESSION_SECRET` and `CAMPUS_TZ`, deploy, open HTTPS URL on a phone, and how per-branch preview deployments work), and SHALL include a **required** Supabase setup section (create project, run `001_items.sql`, add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) performed before the demo, since the deployed app relies on Supabase for persistence (R13.6).
- **R17.5** WHEN the GitHub CLI is installed and authenticated THE system SHALL ask for confirmation before running `gh repo create pantry-network --public --source=. --push`; otherwise it SHALL print the exact manual commands.
- **R17.6** THE system SHALL never run a command requiring the user's login or incurring cost without first asking.

## R18. Acceptance criteria (demo-ready; UI may be plain)

- **R18.1** On a phone via the Vercel HTTPS URL: enter PIN → open camera → photograph a can → review form shows name and date within ~5 seconds → change quantity → Save → confirmation → ready for the next item.
- **R18.2** An unreadable label leaves fields empty with a "date not found" note, and saving with Unknown works.
- **R18.3** An ambiguous date forces a choice between two spelled-out dates or Unknown.
- **R18.4** The saved batch appears in `GET /api/items` and on `/intake/today` with correct fields and `edited_fields`.
- **R18.5** Pages contain no business logic: deleting `src/app/intake` and `src/components` leaves all `src/lib` tests passing.
- **R18.6** With no API key set, the app runs end to end on the mock provider.
- **R18.7** No secrets in the repo; `.kiro` is committed; all tests pass.

---

## Notes from the current Anthropic docs (verified before writing this spec)

These confirmed facts shaped R6 and R5 and differ from older/common patterns:

- **Structured outputs are a first-class feature** via `output_config.format` with `type: "json_schema"` (the older beta `output_format` is deprecated). This is what R6.6 uses — no brace-prefill trick.
- **`claude-haiku-5-5`** is the correct, current, fixed model ID (no date suffix) — matches the brief's default.
- **Haiku 5.5 uses adaptive thinking with an `output_config.effort` dial** (`low | medium | high | xhigh | max`, default `medium`). Lowest is `"low"` (R6.7).
- **`temperature`, `top_p`, `top_k` must be omitted** or the request 400s (R6.8).
- **Assistant prefill is rejected** (R6.9).
- **Refusals return `stop_reason: "refusal"` with HTTP 200** and may not match the schema; `max_tokens` can also truncate output. Both map to `unreadable` (R6.10, R5.7).
- **Enum casing is not guaranteed** in structured outputs, so `category` is compared case-insensitively (R10.2).
- **Schema complexity limits**: max 24 optional parameters and max 16 union-typed (nullable) parameters per schema. `LabelRead` has ~10 nullable fields; the design keeps all fields required (using `["string","null"]` unions and explicit nulls) and must stay within the 16-union budget.

---

## Resolved decisions (from review round 1)

1. **Session cookie**: signed stateless HMAC token with a separate `SESSION_SECRET` env var. The key is NOT derived from `STAFF_PIN` (the PIN may be shared publicly with judges). (R2.3, R2.3a)
2. **Auth routes**: `POST /api/session` sets the cookie, `DELETE /api/session` logs out, `/pin` is the page. (R2.6a)
3. **`source`**: `null` when "not set". (R11.*)
4. **`cost`**: stays out of the review form this module; persisted `null`.
5. **`unit`**: defaults to `'each'`, not shown in UI.
6. **Ambiguous date order**: month-first (US) reading shown **first**, day-first second, both clearly labelled. (R7.4)
7. **"Today" / `received_on`**: computed in `CAMPUS_TZ` (default `"America/New_York"`), never UTC. (R7.7, R11.7)
8. **Deployed storage**: the Vercel demo uses `SupabaseRepository`; `MemoryRepository` is local/test only. (R13.6)
9. **Provider visibility**: read-label response includes `provider`; mock shows "Demo mode: sample reads"; startup warns if `anthropic` selected with no key. (R5.8a, R6.14)
10. **Server-side ambiguity re-check**: after the AI responds, re-run date ambiguity on `date_raw` and override an AI-resolved ambiguous date. (R5.13, P2)
11. **Already-expired items**: show "This date has passed", still savable, store `arrived_expired`. (R9.3a, R11.9, P9)
12. **Duplicate saves**: idempotency key dedupes; double submit returns the existing batch. (R11.10, R15.10)
13. **`VISION_MODEL` default**: `claude-haiku-5-5` — confirmed by current docs, no divergence.

## Open questions

_None open. All review-round-1 questions resolved above._
