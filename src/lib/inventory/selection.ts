// Inventory row selection and the selection bar's actions (PD.8). Pure.
import type { InventoryRow } from "@/lib/db/app-types";
import type { LineInput, ReasonCode } from "@/lib/takeout";

/** Units staff can act on: on the shelf minus what is set aside for Community. */
export const actionable = (r: InventoryRow) => Math.max(0, r.onShelf - r.reserved);

export function toggleOne(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** Select every visible row, or clear them all if they are already selected. */
export function toggleAll(selected: readonly string[], visibleIds: readonly string[]): string[] {
  const allOn = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  if (allOn) return selected.filter((id) => !visibleIds.includes(id));
  return [...selected, ...visibleIds.filter((id) => !selected.includes(id))];
}

/**
 * Remove flow preset for the selected rows. Expired items start at everything
 * on the shelf, others at 1 (staff adjust). The reason is "Expired" when every
 * line is expired, otherwise "Given out by hand".
 */
export function removePreset(rows: InventoryRow[], selected: readonly string[]): { lines: LineInput[]; reason: ReasonCode } {
  const picked = rows.filter((r) => selected.includes(r.productId) && actionable(r) > 0);
  const lines = picked.map((r) => ({ productId: r.productId, qty: r.status === "expired" ? actionable(r) : 1 }));
  const allExpired = picked.length > 0 && picked.every((r) => r.status === "expired");
  return { lines, reason: allExpired ? "expired" : "given_out" };
}

/**
 * Keep rows in the order they were first shown, so a rename or a refresh never
 * makes a row jump while staff are editing (PG.1). New rows go last, by name.
 */
export function keepOrder(rows: InventoryRow[], order: readonly string[]): InventoryRow[] {
  const at = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => {
    const ia = at.get(a.productId) ?? Infinity;
    const ib = at.get(b.productId) ?? Infinity;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name);
  });
}

/** The first selected row that can be offered on Community (not expired, some to spare). */
export function offerTarget(rows: InventoryRow[], selected: readonly string[]): string | null {
  const ok = rows.find((r) => selected.includes(r.productId) && r.status !== "expired" && actionable(r) > 0);
  return ok?.productId ?? null;
}
