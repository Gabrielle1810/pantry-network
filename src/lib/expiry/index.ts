// Expiry presentation logic (UI6). Pure: given an expiry date and today's date
// (both ISO, in CAMPUS_TZ), classify how soon the item expires and produce the
// chip text + tone the UI renders. No date math lives in components.
import { daysUntil } from "@/lib/dates";

export type ExpiryStatus = "expired" | "today" | "soon" | "ok" | "none";
export type ExpiryTone = "amber" | "red" | "neutral";

export interface ExpiryInfo {
  status: ExpiryStatus;
  /** Whole days until expiry (negative if past); null when no date. */
  days: number | null;
}

/**
 * Classify an expiry date relative to today (UI6.1/UI6.2):
 *   null        → "none"
 *   days < 0    → "expired"
 *   days === 0  → "today"
 *   1..7        → "soon"
 *   8+          → "ok"
 */
export function expiryStatus(
  expiresOn: string | null,
  todayIso: string,
): ExpiryInfo {
  if (!expiresOn) return { status: "none", days: null };
  const days = daysUntil(expiresOn, todayIso);
  if (Number.isNaN(days)) return { status: "none", days: null };
  if (days < 0) return { status: "expired", days };
  if (days === 0) return { status: "today", days };
  if (days <= 7) return { status: "soon", days };
  return { status: "ok", days };
}

export interface ExpiryChip {
  text: string;
  tone: ExpiryTone;
}

/** Chip copy + tone from a status (UI6.3). "No date found" handled by the UI. */
export function expiryChip(info: ExpiryInfo): ExpiryChip {
  switch (info.status) {
    case "expired":
      return { text: "Date has passed", tone: "red" };
    case "today":
      return { text: "Expires today", tone: "amber" };
    case "soon":
      return { text: `Expires in ${info.days} day${info.days === 1 ? "" : "s"}`, tone: "amber" };
    case "ok":
      return { text: `Expires in ${info.days} days`, tone: "neutral" };
    case "none":
    default:
      return { text: "No date found", tone: "amber" };
  }
}
