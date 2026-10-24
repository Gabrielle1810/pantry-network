# Pantry Network — Intake

A free, open-source, phone-first web app for university food pantries in
Massachusetts. As a delivery arrives, staff photograph each item, an AI reads
the label (name, size, category, expiry date), staff confirm or edit the
result, and the item is saved as an inventory batch.

This repository is **Module 1: Intake**. Later modules will add student
take-out by QR code, a dashboard, expiry-risk alerts, and surplus sharing
between nearby campuses.

The UI in this module is an intentionally plain placeholder. All behavior
lives in `src/lib` and the API routes, so the frontend can be replaced later
without touching the logic.

## Sample data only

This project uses invented campus names ("Campus A", "Campus B") and invented
items. No real pantry spreadsheets, store names, prices, or student data
appear anywhere. Product photos are handled in memory, stripped of metadata,
and are not stored in this module.

## Status

Working: PIN gate + session, and a Gemini-powered recognition slice. Visit
`/pin` to unlock, then `/intake/test` to photograph an item and see the parsed
label fields and raw JSON. `/` redirects to `/intake`. The full review-and-save
flow and persistence come in later tasks.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind CSS — deployable on Vercel
- zod for validating every API input and AI response
- Vitest + fast-check for unit and property-based tests
- **Google Gemini (`gemini-3.8-flash`)** for label reads, server-side only, via
  the official `@google/genai` SDK (current default, chosen for its free tier).
  An Anthropic Claude (`claude-haiku-5-5`) provider is implemented and kept for
  later but inactive; switching back is an env change plus
  `npm install @anthropic-ai/sdk`.
- Supabase (Postgres) for the deployed demo; in-memory repository for local dev and tests

## Privacy note (Gemini free tier)

On the Gemini API free tier, Google may use submitted content to improve its
products. This app sends **product photos only** — never student data — and
strips photo metadata before upload. Photos are not stored. If that data use is
not acceptable for your deployment, use a paid Gemini tier or switch the
provider (`VISION_PROVIDER`).

## Local setup

> _To be completed in a later task (Task 17)._

```bash
npm install
npm run dev     # http://localhost:3000  (redirects to /intake)
```

Copy `.env.example` to `.env.local` and fill in values. With no `GEMINI_API_KEY`
(or `VISION_PROVIDER=mock`), the app runs end to end on the mock vision provider,
so you can develop without a key.

## Environment variables

> _Full reference completed in Task 17. See `.env.example` for the canonical
> list and comments._ Server-only; never prefix any key with `NEXT_PUBLIC_`.

| Var | Default | Notes |
|---|---|---|
| `STAFF_PIN` | — | PIN to unlock intake; may be shared with testers |
| `SESSION_SECRET` | — | HMAC key for the session token; independent of the PIN |
| `CAMPUS_ID` | `campus-a` | stamps saved batches |
| `CAMPUS_TZ` | `America/New_York` | "today" + `received_on`, never UTC |
| `VISION_PROVIDER` | `gemini` | `gemini` \| `anthropic` \| `mock` |
| `VISION_MODEL` | `gemini-3.5-flash-lite` | model ID for the selected provider |
| `GEMINI_API_KEY` | — | active provider; absent ⇒ mock + startup warning |
| `ANTHROPIC_API_KEY` | — | kept for later; used only if `VISION_PROVIDER=anthropic` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | — | both set ⇒ Supabase repo; else in-memory. Writes use ONLY the service-role key, never the `NEXT_PUBLIC_*`/anon keys |

## Persistence (Supabase)

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both present, the app
uses `SupabaseRepository` (server-only); otherwise it uses an in-memory
repository for local dev and tests. **The in-memory repository resets per
serverless instance, so the deployed Vercel demo needs Supabase for saved
batches, totals, and remembered fixes to persist.** Apply
`supabase/migrations/001_items.sql` once in the Supabase SQL editor (it creates
`items`, `intake_reads`, `product_corrections`, indexes, and enables RLS).

## Running tests

```bash
npm test          # run once
npm run test:watch
```

Tests never call the real AI API; they use a deterministic mock provider.

## API contract

> _Also mirrored in `.kiro/specs/intake/design.md`. The live endpoints:_

### `POST /api/session`
Request `{ "pin": "1234" }`.
- `200 { "ok": true }` + `Set-Cookie: pn_session=…; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`
- `401 { "ok": false, "error": "invalid_pin" }`

### `DELETE /api/session`
- `200 { "ok": true }` + the session cookie cleared.

### `POST /api/vision/read-label` (requires the session cookie)
Request `{ "imageBase64": "<JPEG base64, no data: prefix>" }` (≤ 2 MB decoded).
- `200 { "status": "ok", "provider": "gemini" | "mock", "read": <LabelRead> }`
- `200 { "status": "unreadable", "provider": … }` — fail-soft on any vision
  problem (refusal, timeout, invalid JSON, schema failure). Never 500s for a
  vision issue.
- `400 { "error": "bad_image" }` — not a JPEG, or over 2 MB.
- `401 { "error": "unauthorized" }` — missing/invalid session.

The server re-runs date-ambiguity detection on the model's `date_raw`: if a
numeric date reads two ways, `expires_on` is forced to `null`, `date_ambiguous`
to `true`, and both ISO candidates are returned (the model is never allowed to
pick for the staff). The read also includes a `container` field (can/box/bag/
bottle/jar/pack/carton/item) used to label the save button.

### `POST /api/items` (requires the session cookie)
Save one delivery batch. Request:
```json
{ "idempotencyKey": "uuid",
  "batch": { "name": "Tomato paste", "brand": "Hunt's", "size_text": null,
    "category": "Sauces/Pastes/Spread", "category_group": null, "quantity": 4,
    "unit": "can", "expires_on": "2026-10-26", "date_type": "best_by",
    "date_precision": "day", "date_source": "photo", "dont_track": false,
    "doesnt_expire": false, "perishable": false, "source": null },
  "read": { "name": "...", "brand": "...", "category": "...", "date_raw": "...",
    "expires_on": "...", "name_confidence": 0.9, "date_confidence": 0.8 },
  "editedFields": ["name"] }
```
- `200 { "batch": <ItemBatch>, "totals": { "before", "added", "after", "firstBatch" }, "repository": "memory"|"supabase" }`
- `400 { "error": "invalid_batch", "details": [...] }` — empty name or quantity outside 1..999.
- `401 { "error": "unauthorized" }`.
- `500 { "error": "save_failed" }` — a persistence error (NOT fail-soft like vision).

A repeat `idempotencyKey` returns the existing batch (no duplicate). When
`editedFields` include `name`/`brand`/`category`, the correction is remembered
(keyed by the original read's name+brand) and prefilled on the next matching
read. Dates are never remembered.

### `GET /api/items?since=today` (requires the session cookie)
- `200 { "repository": "memory"|"supabase", "campusId": "campus-a", "items": [ ItemBatch, ... ] }`

## License

[MIT](./LICENSE)
