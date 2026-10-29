// Settings rules (PK). Pure: the morning email preview (built from the same
// status rules as the smart cards; preview only, nothing is sent) and the
// status-rules legend.
import type { InventoryRow } from "@/lib/db/app-types";
import { daysUntil } from "@/lib/dates";
import { pluralizeUnit } from "@/lib/items/units";
import { SOON_DAYS, type Status } from "@/lib/status";
import { communityOfferHref, communityRequestHref } from "@/lib/inventory";
import { COMMUNITY_LABEL } from "@/lib/labels";

export interface EmailItem {
  productId: string;
  name: string;
  category: string;
  sub: string;
  action: { label: string; href: string };
}

export interface MorningEmail {
  heading: string;
  items: EmailItem[];
}

function inDays(iso: string, todayIso: string): string {
  const n = daysUntil(iso, todayIso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/**
 * What the 7 am email would list: items that are out of stock or expiring
 * soon, out first, then soonest date. Greets the team, never a person.
 */
export function morningEmail(rows: InventoryRow[], todayIso: string, campusName: string): MorningEmail {
  const urgent = rows
    .filter((r) => r.status === "out" || r.status === "soon")
    .sort(
      (a, b) =>
        Number(b.status === "out") - Number(a.status === "out") ||
        (a.expiresOn ?? "").localeCompare(b.expiresOn ?? "") ||
        a.name.localeCompare(b.name),
    );
  const items: EmailItem[] = urgent.map((r) =>
    r.status === "out"
      ? {
          productId: r.productId,
          name: r.name,
          category: r.category,
          sub: "Out of stock",
          action: { label: "Request items", href: communityRequestHref(r.name, r.category) },
        }
      : {
          productId: r.productId,
          name: r.name,
          category: r.category,
          sub: `${r.onShelf} ${pluralizeUnit(r.unit, r.onShelf)} · expires ${inDays(r.expiresOn!, todayIso)}`,
          action: { label: `Offer on ${COMMUNITY_LABEL}`, href: communityOfferHref(r.productId) },
        },
  );
  const n = items.length;
  return {
    heading:
      n === 0
        ? `Good morning, ${campusName} team. Nothing needs attention today`
        : `Good morning, ${campusName} team. ${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`,
    items,
  };
}

/** The status legend, in the order the rules are applied. */
export const STATUS_RULES: { status: Status; text: string }[] = [
  { status: "expired", text: "past its date. Hidden from students, listed for removal" },
  { status: "out", text: "nothing on the shelf" },
  { status: "soon", text: `best by within ${SOON_DAYS} days` },
  { status: "low", text: "under a quarter of the last restock" },
  { status: "nodate", text: "no date on the label (dates are optional)" },
  { status: "good", text: "everything else" },
];
