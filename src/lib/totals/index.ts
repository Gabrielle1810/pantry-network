// Inventory totals (UI10). Pure math for the saved screen: how many of this
// product were already on the shelf (before), how many were added, and the new
// total (after). Totals group by the FINAL SAVED name + brand (per the agreed
// decision), using the same normalization as correction keys so grouping is
// stable against trivial variations.
import type { ItemBatch } from "@/lib/items/schema";
import { correctionKey } from "@/lib/corrections";

export interface InventoryTotals {
  before: number;
  added: number;
  after: number;
  firstBatch: boolean;
}

/**
 * Sum existing quantities for the same product (by normalized name|brand) and
 * combine with the newly added quantity (UI10.2/UI10.3/UI10.6). `existing`
 * should be the batches that do NOT include the just-saved one.
 */
export function inventoryTotals(
  existing: ItemBatch[],
  name: string | null,
  brand: string | null,
  added: number,
): InventoryTotals {
  const key = correctionKey(name, brand);
  const before = existing
    .filter((b) => correctionKey(b.name, b.brand) === key)
    .reduce((sum, b) => sum + b.quantity, 0);
  return { before, added, after: before + added, firstBatch: before === 0 };
}
