-- Pantry Network — link the AI accuracy log to the new batches (Step 3).
-- Run after 002_app.sql. Saves now create item_batches instead of `items`
-- rows; this lets each intake_reads row point at its batch so edited_fields
-- and read confidences are still recorded. The `items` table is kept as-is.
--
-- Saves work without this migration (the intake_reads insert is non-fatal),
-- but the accuracy log is skipped until it runs. Safe to re-run.

alter table intake_reads
  add column if not exists batch_id uuid references item_batches(id) on delete cascade;

create index if not exists intake_reads_batch_id on intake_reads (batch_id);
