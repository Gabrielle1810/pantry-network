# Tech stack and rules

## Stack
- Next.js (App Router) with TypeScript, deployed on Vercel (Hobby plan).
- Tailwind CSS, used minimally. No UI component library and no custom visual design in this phase; the frontend will be replaced.
- zod for validating every API input and every AI response.
- Vitest for unit tests, fast-check for property-based tests.
- Vision AI: Anthropic Claude API, model `claude-haiku-5-5`, called only from server code with the official `@anthropic-ai/sdk` package.
- Database (connected later): Supabase (Postgres). Until then, an in-memory repository with sample data.

## Hard rules
- **Secrets stay on the server.** API keys live only in environment variables read by server code. Never use a `NEXT_PUBLIC_` prefix for any key. Never commit `.env` files.
- **Check current docs before writing AI code.** Read the official Anthropic docs for the Messages API, image input and structured outputs before writing the vision call. Do not rely on memory for parameter names or model IDs. If the docs disagree with a spec, follow the docs and say so.
- **Model ID and provider come from env vars** (`VISION_PROVIDER`, `VISION_MODEL`) so they can be swapped without code changes.
- **Vercel limits.** Function request bodies are capped at 4.5 MB. Resize photos in the browser (longest side 1280 px, JPEG quality about 0.8, target under 1 MB) before upload.
- **One AI call per photo.** Retry once only on a network error. Log token usage from each response to the server console.
- **Fail soft.** If the AI call fails, times out (15 s), refuses, or returns invalid JSON, return `status: "unreadable"` so the UI falls back to manual entry. Never return a 500 to the phone for an AI problem.
- **Tests never call the real AI API.** Use a mock provider.
- **Camera.** For now use only `<input type="file" accept="image/*" capture="environment">`, which opens the phone's own camera. A live in-page viewfinder belongs to the later redesign.
- **Logic out of the UI.** All rules (draft building, date handling, validation, edited-field tracking, the intake state machine) live in `src/lib` and the API routes. Pages only render state and call functions, so they can be thrown away.
- **Never add `.kiro` to `.gitignore`.** The hackathon requires the `.kiro` folder in the public repo.
