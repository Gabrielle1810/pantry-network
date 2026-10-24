// Server-side date ambiguity re-check (R5.13, P2). After the AI returns a
// LabelRead, re-run ambiguity detection on date_raw. If the printed date is in
// fact ambiguous but the AI auto-resolved it to a single expires_on, override
// that: force expires_on = null, date_ambiguous = true, and populate both ISO
// candidates. The model is never allowed to pick for the staff (R7.3).
import { detectAmbiguity } from "@/lib/dates";
import { normalizeCategory } from "@/lib/items/taxonomy";
import type { LabelRead } from "./schema";

/**
 * Return a LabelRead with (a) category normalized to a taxonomy value (R10.2/
 * R10.3) and (b) any AI-resolved-but-actually-ambiguous date overridden back to
 * null + candidates (R5.13). Pure function; no I/O.
 */
export function applyServerRechecks(read: LabelRead): LabelRead {
  const category = normalizeCategory(read.category);

  const ambiguity = detectAmbiguity(read.date_raw);
  if (ambiguity.ambiguous) {
    return {
      ...read,
      category,
      expires_on: null,
      date_ambiguous: true,
      date_candidates: ambiguity.candidates,
      // An ambiguous numeric date is a day-precision reading, just unresolved.
      date_precision: read.date_precision ?? "day",
    };
  }

  return { ...read, category };
}
