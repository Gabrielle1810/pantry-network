// Student page rules (PI). Pure: which items a student sees, the cart, and the
// 2-minute repeat-submission check. No names, no personal data.
import type { InventoryRow } from "@/lib/db/app-types";
import { categoryMeta } from "@/lib/items/category-meta";
import type { LineInput } from "@/lib/takeout";

/** Short chip labels → taxonomy groups (null = everything). */
export const STUDENT_GROUPS: { label: string; group: string | null }[] = [
  { label: "All", group: null },
  { label: "Meal Essentials", group: "Meal Essentials" },
  { label: "Instant meals", group: "Microwavable/Instant Meal" },
  { label: "Snacks", group: "Grab & Go Snacks" },
  { label: "Drinks", group: "Drinks & Beverages" },
  { label: "Staples", group: "Other Pantry Staples" },
  { label: "Hygiene", group: "Hygiene Items" },
];

/** A repeat from the same device inside this window is held for staff review. */
export const REPEAT_WINDOW_MS = 2 * 60_000;

export function isRepeatSubmission(lastAtIso: string | null, nowMs: number): boolean {
  if (!lastAtIso) return false;
  const last = Date.parse(lastAtIso);
  return Number.isFinite(last) && nowMs - last < REPEAT_WINDOW_MS;
}

/** What a student can take: on shelf minus reserved for Community. */
export function studentAvailable(row: Pick<InventoryRow, "onShelf" | "reserved">): number {
  return Math.max(0, row.onShelf - row.reserved);
}

/** Students never see expired, empty, or fully reserved items. */
export function isStudentVisible(row: Pick<InventoryRow, "onShelf" | "reserved" | "status">): boolean {
  return row.status !== "expired" && studentAvailable(row) > 0;
}

export function filterStudentRows<T extends Pick<InventoryRow, "name" | "category" | "status">>(
  rows: T[],
  group: string | null,
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  return rows
    .filter((r) => !group || categoryMeta(r.category).group === group)
    .filter((r) => !q || `${r.name} ${r.category}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.status === "soon") - Number(a.status === "soon") || a.name.localeCompare(b.name));
}

export type Cart = Record<string, number>;

export function setCart(cart: Cart, productId: string, qty: number, max: number): Cart {
  const next = Math.min(Math.max(0, Math.round(qty)), Math.max(0, max));
  const copy = { ...cart };
  if (next === 0) delete copy[productId];
  else copy[productId] = next;
  return copy;
}

export function cartLines(cart: Cart): LineInput[] {
  return Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({ productId, qty }));
}

export function cartTotal(cart: Cart): number {
  return Object.values(cart).reduce((n, q) => n + q, 0);
}
