# Product: Pantry Network

## What it is
A free, open-source web app for university food pantries in Massachusetts. Staff add incoming items by photographing them on a phone. Later modules will add student take-out by QR code, a dashboard, expiry-risk alerts, and sharing surplus between nearby campuses.

## Current module: Intake
Staff photograph each item as a delivery arrives. AI reads the label (name, size, category, expiry date). Staff confirm or edit the result, then save. The item becomes an inventory batch.

## Users
- Pantry staff and volunteers, on their own phone, standing at the pantry during a delivery. They are busy and in a hurry. Intake must be faster than typing into a spreadsheet.
- Students never use the Intake module.

## Product rules (always follow)
1. **Beat the spreadsheet.** Required to save: a name and a quantity. Everything else is optional.
2. **Dates are optional.** Never block a save because a date is missing. "Unknown" and "Don't track a date" are valid answers.
3. **A human confirms every AI read.** AI output is a suggestion shown in editable fields. Nothing is saved without the staff member pressing Save.
4. **Never invent data.** If the label is unreadable, show it as unknown. Never fill a guessed date.
5. **Privacy.** No student data anywhere in this module. Photos show products only. Strip photo metadata (location) before upload. Do not store photos in this phase.
6. **Dignity.** Use plain, warm, stigma-free language. Never use words like "needy" or "handout".
7. **Phone first.** Pages must work on a 390 px wide phone screen.
8. **Accessible basics.** Labelled inputs, real buttons, usable with a screen reader. Full visual accessibility work comes with the redesign.
9. **Sample data only.** Use invented campus names ("Campus A", "Campus B") and invented items. Never commit real pantry spreadsheets, store names or prices.
10. **The UI is a placeholder.** The current screens exist only to exercise the pipeline and will be fully redesigned later. Keep them plain and functional. Design images are inspiration for what a screen must do, not a visual spec. Spend effort on the logic, API, data and tests instead.

## Draft interface copy (placeholder wording; may change in the redesign)
- Camera hint: "Show the item's name and the date on its label."
- Review title: "Check this item"   Badge: "You can edit anything"
- Field labels: "Identified as", "Expiration date", "How many?"
- Date read note: "Read from the label: {best by | use by | sell by}."
- Date missing note: "Date not found. Type it in, or leave it as Unknown and we'll ask again."
- Checkbox: "This item moves fast: don't track a date"
- Buttons: "Retake", "Save item", "Done"
