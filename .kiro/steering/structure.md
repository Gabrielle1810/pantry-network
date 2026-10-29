# Project structure

```
/
├── .kiro/                        # specs, steering, hooks (must be committed)
│   └── specs/pantry-app/         # current spec (intake/ and intake-ui/ are earlier phases)
├── design-reference/app/         # the prototype: visual + behavioral spec (not built, linted or tested)
├── src/
│   ├── proxy.ts                  # staff PIN guard for manager pages/APIs; wrong student token → real 404
│   ├── app/
│   │   ├── page.tsx              # redirects to /intake → /add
│   │   ├── pin/page.tsx          # staff PIN gate
│   │   ├── (manager)/            # sidebar (laptop) / top bar (phone) shell + campus switcher
│   │   │   ├── inventory/        # smart cards, tabs, edit drawer, Full sheet, selection bar
│   │   │   ├── add/              # phone camera flow or laptop typed form
│   │   │   ├── takeout/          # Out today feed, Record items out, Fix, Count looks off
│   │   │   ├── community/        # offers, requests, claims, pickups
│   │   │   ├── settings/         # morning email preview, status rules, Reset demo data
│   │   │   ├── help/
│   │   │   └── poster/           # printable QR poster for the student page
│   │   ├── s/[token]/            # public student take-out page (no login, no names)
│   │   ├── intake/               # /intake → /add; /intake/test is a debug page (behind the PIN, not in nav)
│   │   └── api/
│   │       ├── session/          # checks the PIN, sets the session cookie
│   │       ├── campus/           # active campus (cookie)
│   │       ├── inventory/        # GET rows; POST edit (adjustments, never overwrites)
│   │       ├── items/            # save one intake batch (camera or typed)
│   │       ├── vision/read-label/
│   │       ├── takeout/          # record, fix, delete, undo, recount, held
│   │       ├── community/        # offer, withdraw, request, claim, pickup
│   │       ├── student/takeout/  # public; token → campus
│   │       └── seed/             # load or reset the sample data
│   ├── components/               # thin UI per page (inventory, add, takeout, community,
│   │                             # student, poster, settings, shell, ui primitives)
│   └── lib/
│       ├── auth/                 # PIN check, signed session token
│       ├── campus/               # sample campuses, active campus
│       ├── db/                   # Store (memory, Supabase), AppService rules, seed plan
│       ├── stock/                # derived on-shelf, FIFO, active expiry
│       ├── status/               # status precedence (expired, out, soon, low, nodate, good)
│       ├── inventory/            # smart cards, tabs, edits plan, history, selection
│       ├── intake/               # review state machine + ReviewDraft rules
│       ├── takeout/              # reasons, feed, fix math, undo window
│       ├── student/              # student visibility, repeat-submission hold, token checks
│       ├── community/            # recommendations, offer views, amounts
│       ├── settings/             # morning email model, status legend
│       ├── vision/               # provider interface, gemini, anthropic, mock, prompt, schema
│       ├── dates/  image/  items/  corrections/  totals/  expiry/  device/  qr/  labels/
│       └── **/*.test.ts          # tests sit next to the code
├── supabase/migrations/          # 001_items, 002_app, 003_intake_reads_batch, 004_takeout_community
├── .env.example                  # variable names, no secrets
├── DEPLOY.md
├── README.md
└── LICENSE                       # MIT
```

## Conventions
- Business logic lives in `src/lib`, not in React components, so it can be tested without a browser.
- Deleting `src/app` and `src/components` must not break any `src/lib` test.
- Storage goes through the `Store` interface; every rule is written once in `AppService` and runs the same on memory and Supabase. UI and routes use `getAppRepository()`, never a specific store.
- The Community label and URL come from `src/lib/labels` only.
- Name tests after the requirement they cover, for example `PD.7a editing on-shelf writes an adjustment equal to the difference`.
