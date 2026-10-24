# Project structure

```
/
├── .kiro/                    # specs, steering, hooks (must be committed)
├── src/
│   ├── app/
│   │   ├── page.tsx                  # redirects to /intake
│   │   ├── pin/page.tsx              # staff PIN gate
│   │   ├── intake/page.tsx           # placeholder: capture + review form
│   │   └── api/
│   │       ├── session/route.ts      # checks PIN, sets cookie
│   │       ├── vision/read-label/route.ts
│   │       └── items/route.ts        # save and list item batches
│   ├── components/intake/            # placeholder UI only (thin, replaceable)
│   ├── lib/
│   │   ├── intake/                   # headless state machine + ReviewDraft rules
│   │   ├── vision/                   # provider interface, anthropic provider, mock provider, prompt, schema
│   │   ├── dates/                    # parse, normalize, ambiguity detection
│   │   ├── items/                    # ItemBatch type, validation, taxonomy
│   │   ├── image/                    # browser resize and re-encode
│   │   └── db/                       # ItemRepository interface, memory repo, supabase repo
│   └── tests/ (or *.test.ts next to the code)
├── supabase/migrations/001_items.sql # schema, applied later
├── public/
├── .env.example
├── DEPLOY.md
├── README.md
└── LICENSE                           # MIT
```

## Conventions
- Business logic lives in `src/lib`, not in React components, so it can be tested without a browser.
- `src/app` pages and `src/components` are a temporary placeholder UI. Deleting them must not break any `src/lib` test.
- Each module in `src/lib` exports a small typed interface. UI imports the interface, never a specific provider or database.
- Name tests after the requirement they cover, for example `R4.2 ambiguous dates are never auto-resolved`.
