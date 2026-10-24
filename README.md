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

Scaffold in place: Next.js (App Router) + TypeScript + Tailwind, with Vitest +
fast-check wired up. `/` redirects to `/intake`.

## Tech stack

- Next.js (App Router), TypeScript, Tailwind CSS — deployable on Vercel
- zod for validating every API input and AI response
- Vitest + fast-check for unit and property-based tests
- Anthropic Claude (`claude-haiku-5-5`) for label reads, server-side only
- Supabase (Postgres) for the deployed demo; in-memory repository for local dev and tests

## Local setup

> _To be completed in a later task (Task 17)._

```bash
npm install
npm run dev     # http://localhost:3000  (redirects to /intake)
```

Copy `.env.example` to `.env.local` and fill in values. With no
`ANTHROPIC_API_KEY`, the app runs end to end on the mock vision provider.

## Environment variables

> _Full table to be completed in a later task. See `.env.example` for the
> current list._

## Running tests

```bash
npm test          # run once
npm run test:watch
```

Tests never call the real AI API; they use a deterministic mock provider.

## API contract

> _The full request/response contract for `/api/session`,
> `/api/vision/read-label`, and `/api/items` will be documented here (Task 17).
> It is also defined in `.kiro/specs/intake/design.md`._

## License

[MIT](./LICENSE)
