# Pantry Network

A free, open-source web app for university food pantries in Massachusetts.
Staff add stock by photographing items on a phone, see what is on the shelves,
record what goes out, and share surplus with nearby campuses. Students take
items by scanning a QR poster, with no login and no names.

**Live demo:** https://pantry-network.vercel.app

## Features

- **Add stock.** On a phone, the camera reads the label (name, size, category,
  best-by date) with Gemini. Staff check or edit every field, then save. On a
  laptop, Add stock is a typed form (no camera, no upload). Dates are optional,
  ambiguous dates are never guessed, and fixes to a label read are remembered
  for next time.
- **Inventory.** Smart cards for running low, expiring soon and expired items;
  tabs and search; an edit drawer with history; a Full sheet that edits like a
  spreadsheet; and a selection bar to remove items or offer them on Community.
- **Stock is never overwritten.** On-shelf is derived from intake batches plus
  an append-only ledger. Editing a count writes an "Edited by staff" adjustment
  for the difference, shown in the item's history.
- **Take-out.** The student QR page shows only in-stock, non-expired items.
  Staff record removals (with a 10-second Undo), fix or delete entries, and
  resolve "Count looks off". A second student submission from the same device
  within 2 minutes is held for staff review. No names are stored, ever.
- **Community.** Offer surplus to nearby campuses. An offer sets stock aside;
  it leaves the shelf only when the claiming campus marks the pickup done, and
  then arrives in their inventory. Requests and recommendations included.
- **Settings and Help.** Morning email preview (nothing is sent), the status
  rules, and Reset demo data.
- **Two live campuses** (Harbor University, Cedar Hill College) with a campus
  switcher. Four more sample campuses appear on Community.

## How to test (judges)

The app is behind a staff PIN. The PIN comes from the `STAFF_PIN` environment
variable and is never written in this repository. **The demo PIN is in the
submission's testing instructions.**

1. **Phone.** Open the live link and enter the PIN. **Add stock** opens:
   photograph a food item's label. Check the fields, set how many, and save.
2. **Laptop.** Open **Inventory**: the item you just saved is there. Click a
   row to open the edit drawer, change "On the shelf" and save; the change
   appears in History as an adjustment. Try **Full sheet**, and tick a few rows
   to see the selection bar.
3. **Student page.** Open **Take-out → Reprint the QR poster** (or `/poster`)
   and scan the QR code with a phone. Take a couple of items and press Done.
   The entry shows up in the Take-out feed as "Student scan". Submit again
   within 2 minutes and the second one is held for review.
4. **Community.** As Harbor University, claim Cedar Hill College's canned corn
   offer, then **Mark picked up**: Harbor's corn goes up. Switch to Cedar Hill
   College with the campus switcher: its corn went down by the same amount,
   exactly once.
5. **Settings.** See the morning email preview. **Reset demo data** puts every
   sample number back (posters keep working).

## Sample data only

Every campus, item, brand and contact in this project is invented ("Harbor
Pantry", "Valley Farms", "Sunrise" and so on). No real pantry spreadsheets,
store names, prices, trademarks or student data appear in the app. Product
photos are resized in the browser, re-encoded to strip metadata (such as
location), read once, and never stored.

## Tech stack

- Next.js 16 (App Router, `cacheComponents`), TypeScript, React 19, Tailwind
  CSS v4, deployed on Vercel. `src/proxy.ts` guards staff pages and APIs.
- zod validates every API input and every AI response.
- Vitest + fast-check for unit and property-based tests.
- Google Gemini (`gemini-3.5-flash-lite` by default) for label reads, server
  side only, via `@google/genai`. An Anthropic provider is implemented but
  inactive. A mock provider runs when no key is set.
- Supabase (Postgres) on the deployed app; an in-memory store with the same
  sample data for local dev and tests.

All rules live in `src/lib` (stock, status, take-out, Community, edits, dates)
and the API routes. The pages are thin and replaceable.

### Privacy note (Gemini free tier)

On the Gemini API free tier, Google may use submitted content to improve its
products. This app sends **product photos only**, never student data, and
strips photo metadata before upload. If that is not acceptable for your
deployment, use a paid tier or change `VISION_PROVIDER`.

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

With no Supabase variables, the app uses the in-memory store, which seeds
itself with the sample data. With no `GEMINI_API_KEY` (or
`VISION_PROVIDER=mock`), label reads come from the mock provider, so you can
run everything without any key.

```bash
npm test          # all tests, once
npm run lint
npm run build
```

Tests never call the real AI API or a real database.

## Environment variables

All are server-only. Never use a `NEXT_PUBLIC_` key. See `.env.example`.

| Variable | Purpose |
|---|---|
| `STAFF_PIN` | PIN staff enter to unlock the app |
| `SESSION_SECRET` | signs the session cookie; long and random, separate from the PIN |
| `CAMPUS_TZ` | the pantry's time zone, for "today" and received dates |
| `VISION_PROVIDER` | `gemini`, `anthropic` or `mock` |
| `VISION_MODEL` | model ID for the selected provider |
| `GEMINI_API_KEY` | Gemini key; without it, the mock provider is used |
| `ANTHROPIC_API_KEY` | only if `VISION_PROVIDER=anthropic` |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side writes; with `SUPABASE_URL` set, the app uses Supabase |

## Database (Supabase)

Run the migrations in the Supabase SQL editor, **in this order**, once each
(all are safe to re-run):

1. `supabase/migrations/001_items.sql`
2. `supabase/migrations/002_app.sql`
3. `supabase/migrations/003_intake_reads_batch.sql`
4. `supabase/migrations/004_takeout_community.sql`

Then load the sample data: sign in, open **Settings → Reset demo data**. (Or
call `POST /api/seed` with `{"reset": true}` while signed in. Without
`reset`, it only adds what is missing.) Reset replaces all sample-campus data
and keeps each campus's student token, so printed posters keep working.

Deployment steps are in [DEPLOY.md](./DEPLOY.md).

## API

Staff endpoints need the session cookie from `POST /api/session`; without it
they return `401`. Every body is validated with zod.

| Endpoint | What it does |
|---|---|
| `POST /api/session` / `DELETE /api/session` | sign in with the PIN / sign out |
| `GET` / `POST /api/campus` | read / switch the active campus |
| `GET /api/inventory` | derived inventory rows for the active campus |
| `POST /api/inventory` | `{ action: "edit", productId, edit }` from the drawer or Full sheet |
| `POST /api/vision/read-label` | read a label photo; fails soft to `status: "unreadable"` |
| `POST /api/items` | save one intake batch (idempotent by key) |
| `POST /api/takeout` | `record`, `fix`, `delete`, `undo`, `recount`, `held` |
| `POST /api/community` | `offer`, `withdraw`, `request`, `claim`, `pickup` |
| `POST /api/student/takeout` | public; the student page's Done, scoped by its token |
| `POST /api/seed` | load or reset the sample data |

## License

[MIT](./LICENSE)
