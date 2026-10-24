# Pantry Network (demo)

A clickable build of the "Complete flow v3" Figma page, running on mocked data. No install or build step.

## Run it

```bash
cd app && python3 -m http.server 5173
```

Then open http://localhost:5173. Opening `index.html` directly from disk will not work in every browser, so use the server.

## Screens

| Route | What it is |
| --- | --- |
| `#/inventory` | Smart cards, tabs, search, Simple / Full sheet views, edit drawer, select rows → Remove (with undo) |
| `#/add` | Phone flow: point at the label → we read it (or no date found) → saved, keep going |
| `#/student` | Student take-out from the QR poster: tap what you took → thank you |
| `#/takeout` | Out today feed (students + staff), Record items out, Fix an entry |
| `#/share` | Recommendations, offers with smart chips, Claim → pickup → Mark picked up (stock moves) |
| `#/poster` | Printable QR poster that links to the student page |
| `#/settings` | Morning email preview, status rules, Reset demo data |

## Data

- All sample data is in `data.js` (invented campuses, items and numbers).
- Changes are saved in the browser's localStorage. Use Settings → Reset demo data to start over.
- "Today" is fixed to 10/24/2026 so the dates in the designs line up.
- Label reading is mocked: each photo cycles through `MOCK_READS` in `data.js`.
