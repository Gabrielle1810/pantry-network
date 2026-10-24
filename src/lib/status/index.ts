// Product status rules (PB.3). Pure and ordered exactly like the prototype's
// statusOf: expired → out → soon → low → nodate → good. A product resolves to
// exactly one status.
import { daysUntil } from "@/lib/dates";

export type Status = "expired" | "out" | "soon" | "low" | "nodate" | "good";

/** Soonest date within this many days (inclusive) counts as "expiring soon". */
export const SOON_DAYS = 14;
/** Running low when on-shelf is below this fraction of the last restock amount. */
export const LOW_FRACTION = 1 / 4;

export interface StatusInput {
  /** Derived on-shelf quantity. */
  onShelf: number;
  /** Quantity of the most recent intake batch (the "of"). */
  lastRestock: number;
  /** Soonest relevant expiry date (ISO) or null. */
  soonestDate: string | null;
  /** True for items that never expire (hygiene, foil, etc.). */
  noExpire: boolean;
}

/** Human-readable label for each status (matches the prototype STATUS map). */
export const STATUS_LABEL: Record<Status, string> = {
  good: "Good",
  low: "Running low",
  out: "Out of stock",
  soon: "Expiring soon",
  expired: "Expired",
  nodate: "No date",
};

/**
 * Compute a product's status. Precedence is strict and matches the prototype:
 *   1. expired  — has a date and it is in the past
 *   2. out      — nothing on the shelf
 *   3. soon     — has a date within SOON_DAYS
 *   4. low      — on-shelf < lastRestock * LOW_FRACTION
 *   5. nodate   — no date and does not "doesn't expire"
 *   6. good
 */
export function statusOf(input: StatusInput, todayIso: string): Status {
  const { onShelf, lastRestock, soonestDate, noExpire } = input;

  if (soonestDate && daysUntil(soonestDate, todayIso) < 0) return "expired";
  if (onShelf === 0) return "out";
  if (soonestDate && daysUntil(soonestDate, todayIso) <= SOON_DAYS) return "soon";
  if (lastRestock > 0 && onShelf < lastRestock * LOW_FRACTION) return "low";
  if (!soonestDate && !noExpire) return "nodate";
  return "good";
}
