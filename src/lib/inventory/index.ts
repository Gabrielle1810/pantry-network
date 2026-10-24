// Inventory view-models (PD.1-PD.6). Pure logic: given derived InventoryRows,
// produce the four smart-card models, the tab filters + counts, and the search
// filter. Components render these; no business logic in the UI.
import type { InventoryRow } from "@/lib/db/app-types";
import { daysUntil } from "@/lib/dates";

// ---- tabs ----
export type InventoryTabKey =
  | "all"
  | "donated"
  | "purchased"
  | "low"
  | "soon"
  | "expired"
  | "nodate";

export const INVENTORY_TABS: { key: InventoryTabKey; label: string; match: (r: InventoryRow) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "donated", label: "Donated", match: (r) => r.source === "donated" },
  { key: "purchased", label: "Purchased", match: (r) => r.source === "purchased" },
  { key: "low", label: "Running low", match: (r) => r.status === "low" || r.status === "out" },
  { key: "soon", label: "Expiring soon", match: (r) => r.status === "soon" },
  { key: "expired", label: "Expired", match: (r) => r.status === "expired" },
  { key: "nodate", label: "No date", match: (r) => !r.expiresOn && !r.noExpire },
];

export function tabCounts(rows: InventoryRow[]): Record<InventoryTabKey, number> {
  const counts = {} as Record<InventoryTabKey, number>;
  for (const t of INVENTORY_TABS) counts[t.key] = rows.filter(t.match).length;
  return counts;
}

export function filterRows(rows: InventoryRow[], tab: InventoryTabKey, search: string): InventoryRow[] {
  const match = INVENTORY_TABS.find((t) => t.key === tab)?.match ?? (() => true);
  const q = search.trim().toLowerCase();
  return rows
    .filter(match)
    .filter((r) => !q || `${r.name} ${r.brand ?? ""} ${r.category}`.toLowerCase().includes(q));
}

// ---- smart cards ----
export type CardTone = "red" | "blue" | "gray" | "green" | "amber";

export interface SmartCardModel {
  tone: CardTone;
  icon: string; // lucide icon name
  label: string;
  num?: number;
  title: string;
  sub: string;
}

function inDays(iso: string, todayIso: string): string {
  const n = daysUntil(iso, todayIso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
}

/** The four Inventory smart cards (PD.1), from derived rows. */
export function inventoryCards(rows: InventoryRow[], todayIso: string): SmartCardModel[] {
  const low = rows
    .filter((r) => r.status === "low" || r.status === "out")
    .sort((a, b) => a.onShelf / Math.max(a.lastRestock, 1) - b.onShelf / Math.max(b.lastRestock, 1));
  const soon = rows
    .filter((r) => r.status === "soon" && r.expiresOn)
    .sort((a, b) => (a.expiresOn! < b.expiresOn! ? -1 : 1));
  const expired = rows.filter((r) => r.status === "expired");
  const donated = rows.filter((r) => r.source === "donated").length;

  const lowFirst = low[0];
  const soonFirst = soon[0];

  return [
    {
      tone: "red",
      icon: "trending-down",
      label: "Running low",
      num: low.length,
      title: lowFirst
        ? lowFirst.onShelf === 0
          ? `${lowFirst.name} is out of stock`
          : `${lowFirst.name} is running low`
        : "Nothing is running low",
      sub: lowFirst
        ? `${lowFirst.onShelf} of ${lowFirst.lastRestock} on the shelf${
            low.length > 1 ? ` · ${low.slice(1, 3).map((r) => r.name).join(" and ")} ${low.length > 2 ? "are" : "is"} next` : ""
          }`
        : "Every item has at least a quarter of its last restock",
    },
    {
      tone: "blue",
      icon: "clock",
      label: "Expiring soon",
      num: soon.length,
      title: soonFirst ? `${soonFirst.name} expires ${inDays(soonFirst.expiresOn!, todayIso)}` : "Nothing expires in the next 2 weeks",
      sub: soonFirst
        ? `${soonFirst.onShelf} ${soonFirst.unit} left · put them at the front so they go first`
        : "Dated items are all good for now",
    },
    {
      tone: "red",
      icon: "triangle-alert",
      label: "Expired",
      num: expired.length,
      title: expired.length ? `Take ${expired.length} item${expired.length === 1 ? "" : "s"} off the shelves` : "Nothing is past its date",
      sub: expired.length
        ? `${expired.slice(0, 2).map((r) => r.name).join(", ")}${expired.length > 2 ? ` and ${expired.length - 2} more` : ""} ${expired.length === 1 ? "is" : "are"} past the date`
        : "Students only ever see food that is still good",
    },
    {
      tone: "gray",
      icon: "package",
      label: "Items this period",
      num: rows.length,
      title: `${rows.length} products tracked`,
      sub: `${donated} donated · ${rows.length - donated} purchased`,
    },
  ];
}

/** Stock-bar tone from the ratio on shelf vs last restock (PD.6). */
export function stockTone(onShelf: number, lastRestock: number): "g" | "a" | "r" {
  const ratio = lastRestock ? onShelf / lastRestock : 0;
  return ratio >= 0.5 ? "g" : ratio >= 0.25 ? "a" : "r";
}

/** Expiry cell text/tone for a row (PD.6). */
export function expiryCell(row: InventoryRow, todayIso: string): { text: string; tone: "red" | "blue" | "muted"; note?: string } {
  if (!row.expiresOn) {
    return { text: row.noExpire ? "Doesn't expire" : "No date", tone: "muted" };
  }
  if (row.status === "expired") return { text: row.expiresOn, tone: "red" };
  if (row.status === "soon") return { text: row.expiresOn, tone: "blue", note: inDays(row.expiresOn, todayIso) };
  return { text: row.expiresOn, tone: "muted" };
}
