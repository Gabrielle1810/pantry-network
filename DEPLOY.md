# Deploying Pantry Network

The live demo runs on Vercel (Hobby plan) with Supabase (Postgres). Vercel
redeploys automatically on every push to `main`.

## 1. Supabase

1. Create a Supabase project.
2. In the SQL editor, run the migrations **in this order**, once each. All are
   safe to re-run.
   1. `supabase/migrations/001_items.sql`
   2. `supabase/migrations/002_app.sql`
   3. `supabase/migrations/003_intake_reads_batch.sql`
   4. `supabase/migrations/004_takeout_community.sql`
3. RLS is enabled on every table with no policies yet. The app writes only from
   the server with the service-role key, which bypasses RLS. Nothing is exposed
   to the browser.

## 2. Vercel

1. Import the GitHub repository as a Next.js project.
2. Connect Supabase (the Supabase Marketplace integration adds `SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY`, plus other variables this app ignores).
3. Add these environment variables (names only here; never commit values):

   | Variable | Notes |
   |---|---|
   | `STAFF_PIN` | the staff PIN; share it with testers outside the repo |
   | `SESSION_SECRET` | long random string, independent of the PIN |
   | `CAMPUS_TZ` | the pantry's time zone |
   | `VISION_PROVIDER` | `gemini` |
   | `VISION_MODEL` | the Gemini model ID (see `.env.example`) |
   | `GEMINI_API_KEY` | from Google AI Studio |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from the integration |

   No variable may use the `NEXT_PUBLIC_` prefix for a key, and writes never
   use the anon/publishable keys.
4. Deploy (or push to `main`).

## 3. Load the sample data

1. Open the site, enter the PIN.
2. Go to **Settings → Reset demo data** and confirm.

This deletes all sample-campus data (products with their batches and ledger,
offers, requests, pickups, held submissions, count checks, remembered fixes),
then seeds it fresh, so the numbers match the prototype. Each campus keeps its
student token, so printed QR posters keep working. "Load missing sample data"
only fills gaps and is safe to run twice.

Run **Reset demo data** after any change to the seed (for example, the switch
to invented brand names), or the old sample products stay next to the new ones.

## 4. Check the deployment

- `/pin` accepts the PIN and opens Add stock; Inventory shows Harbor University.
- **Add stock** on a phone opens the camera; a read fills the fields.
- Editing "On the shelf" in the Inventory drawer adds an "Edited by staff" line
  to History.
- `/poster` shows a QR code; scanning it opens the student page.
- `/s/harbor` (a campus id, not a token) returns a real 404.
- Without the PIN, staff pages redirect to `/pin` and staff APIs return 401.

## Notes

- **Body size.** Vercel functions accept at most 4.5 MB. Photos are resized in
  the browser (longest side 1280 px, JPEG about 0.8) and the read-label API
  rejects anything over 2 MB.
- **Vision failures fail soft.** A timeout, refusal or bad JSON returns
  `status: "unreadable"` and the phone falls back to typing; never a 500.
- **Gemini free tier.** Google may use submitted content to improve its
  products. Only product photos are sent, with metadata stripped.
- **Rotating secrets.** Changing `SESSION_SECRET` signs everyone out. Changing
  `STAFF_PIN` takes effect on the next sign-in.
- **Without Supabase**, the app falls back to an in-memory store that resets
  per serverless instance. Fine for local dev, not for the demo.
