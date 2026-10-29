# Product: Pantry Network

## What it is
A free, open-source web app for university food pantries in Massachusetts. Staff run the pantry from a phone or a laptop: they add stock by photographing items, see what is on the shelves, record what goes out, and share surplus with nearby campuses. Students take items by scanning a QR poster, with no login and no names.

## What is built
- **Add stock.** On a phone, the camera reads the label (name, size, category, expiry date) and staff confirm or edit, then save. On a laptop, Add stock is a typed form. Every save becomes an inventory batch.
- **Inventory.** Smart cards (running low, expiring soon, expired, items this period), tabs, search, an edit drawer, a Full sheet for spreadsheet-style editing, and a selection bar (Remove, Offer on Community).
- **Take-out.** The student QR page, staff "Record items out" with a 10-second Undo, Fix and Delete on feed entries, "Count looks off", and repeat student submissions held for review.
- **Community.** Offers that set stock aside, requests, claims, and "Mark picked up", which moves stock between campuses exactly once.
- **Settings and Help.** Morning email preview (nothing is sent), the status rules, and Reset demo data.
- Two live sample campuses (Harbor University and Cedar Hill College) with a campus switcher. Four more sample campuses appear only on Community.

## Users
- Pantry staff and volunteers: on their own phone during a delivery (busy, in a hurry; intake must beat typing into a spreadsheet), and on a laptop for inventory, take-out and Community.
- Students use only the public QR take-out page.

## Product rules (always follow)
1. **Beat the spreadsheet.** Required to save: a name and a quantity. Everything else is optional.
2. **Dates are optional.** Never block a save because a date is missing. "No date" and "Doesn't expire" are valid answers.
3. **A human confirms every AI read.** AI output is a suggestion shown in editable fields. Nothing is saved without the staff member pressing Save.
4. **Never invent data.** If the label is unreadable, show it as unknown. Never fill a guessed date. Ambiguous dates are never auto-resolved.
5. **No names.** No student data anywhere. Take-out records store no person's name, staff or student. The student page uses only a random device cookie (never a name or IP). Photos show products only, have their metadata stripped, and are not stored.
6. **Stock is never overwritten.** On-shelf is derived from intake batches plus an append-only ledger. Edits, recounts and fixes write an adjustment for the difference, visible in History. "Moved to Community" sets stock aside; it leaves the shelf only when the pickup is marked done.
7. **Desktop is typed.** On a laptop, Add stock is a typed form only: no camera, no upload, no picture. Phones get the camera, with "Type it instead".
8. **Dignity.** Use plain, warm, stigma-free language. Never use words like "needy" or "handout".
9. **Phone first, laptop too.** Every page must work on a 390 px wide phone screen and on a laptop.
10. **Follow the design reference.** `design-reference/` (the prototype) is the visual and behavioral spec, with the approved changes in `.kiro/specs/pantry-app` (the "Community" label, stock never overwritten, no names, held repeat submissions). It stays out of the build, lint and tests.
11. **Accessible, no jumps.** Labelled inputs, real buttons, 44 px targets, visible focus, AA contrast, no color-only meaning. Modals, drawers, steppers and tabs update in place: no re-mount, no replayed animation, no scroll jump.
12. **Sample data only.** Invented campus names, invented items and invented brands (Harbor Pantry, Valley Farms, Sunrise, and so on). Never real brands or trademarks, real pantry spreadsheets, store names or prices.

## Interface copy
Wording follows `design-reference/`, kept plain and warm. Examples in the app:
- Camera hint: "Show the item's name and the date on the label"
- After a save: "Saved to Inventory", with the before + added = after line
- Inventory edits: "A new number is saved as an adjustment in History. Nothing is overwritten."
- Take-out: "No names are ever recorded for students"
