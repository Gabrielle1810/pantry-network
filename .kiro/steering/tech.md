# Tech stack and rules

## Stack
- Next.js 16 (App Router, Turbopack) with TypeScript and React 19, deployed on Vercel (Hobby plan). Auto-deploys on every push to `main`.
- `cacheComponents: true` in `next.config.ts`. Request guard lives in `src/proxy.ts` (Next 16's name for middleware; Node runtime).
- Tailwind CSS v4 with the design tokens from `design-reference/` in `globals.css` `@theme`. Icons from `lucide-react`, font Figtree via `next/font`. No UI component library.
- zod for validating every API input and every AI response.
- Vitest for unit tests, fast-check for property-based tests.
- Vision AI: **Google Gemini (current default)**, model `gemini-3.5-flash-lite`, called only from server code with the official `@google/genai` package. The Anthropic Claude provider (`claude-haiku-5-5`, `@anthropic-ai/sdk`) is implemented and kept for later but inactive; switching back is an env change plus `npm install @anthropic-ai/sdk`. A mock provider runs when no key is set.
- Database: Supabase (Postgres), migrations `001`-`004` in `supabase/migrations`. The app uses it when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are both set; otherwise an in-memory store seeded with the same sample data (local dev and tests).

## Hard rules
- **Secrets stay on the server.** API keys and the service-role key live only in environment variables read by server code. Never use a `NEXT_PUBLIC_` key for anything, and never for writes. Never commit `.env` files. Never write the staff PIN in the repo.
- **Check current docs before writing AI code.** Read the official docs for the active provider (Gemini now: ai.google.dev, `@google/genai`, image input, structured output with a JSON schema) before changing the vision call. Do not rely on memory for parameter names or model IDs. If the docs disagree with a spec, follow the docs and say so. Next.js ships its own docs in `node_modules/next/dist/docs`.
- **Gemini free tier privacy.** On the free tier, Google may use submitted content to improve its products. We send product photos only, never student data, and strip photo metadata before upload. Noted in the README.
- **Model ID and provider come from env vars** (`VISION_PROVIDER`, `VISION_MODEL`) so they can be swapped without code changes.
- **Vercel limits.** Function request bodies are capped at 4.5 MB. Resize photos in the browser (longest side 1280 px, JPEG quality about 0.8, target under 1 MB) before upload.
- **One AI call per photo.** Retry once only on a network error. Log token usage from each response to the server console.
- **Fail soft.** If the AI call fails, times out (15 s), refuses, or returns invalid JSON, return `status: "unreadable"` so the UI falls back to manual entry. Never return a 500 to the phone for an AI problem.
- **Tests never call the real AI API or a real database.** Use the mock provider, the memory store, or a faked supabase-js client.
- **Camera.** Phones get a live rear-camera viewfinder (`getUserMedia`) with `<input type="file" accept="image/*" capture="environment">` as the fallback. Laptops never show a camera or upload.
- **Stock is derived.** Never add a stored quantity column. On-shelf = intake batches + ledger deltas. Every change is a ledger row (idempotent where a retry is possible); edits write the difference, never the new total.
- **Logic out of the UI.** All rules (draft building, dates, validation, stock, status, take-out, Community, edits, history) live in `src/lib` and the API routes. Components only render state and call functions. Deleting `src/app` and `src/components` must leave every `src/lib` test passing.
- **Next 16 + cacheComponents.** No `export const runtime` or `export const dynamic`. Read request data with `await connection()` inside a `<Suspense>` child. A wrong student token must return a real 404 from `src/proxy.ts`, before rendering. No `crypto.randomUUID()` during client render. No `setState` called directly in a `useEffect` body (lint error).
- **Never add `.kiro` to `.gitignore`.** The hackathon requires the `.kiro` folder in the public repo. Scratch files go in `.tmp/`, which is gitignored.
