// Inventory edits (PD.7, PD.7a, PD.10) and the per-product history list. Pure.
//
// An edit never overwrites a stored stock number. Changing "on the shelf" plans
// a signed adjustment (new − current) that AppService writes as a `recount`
// ledger row with the reason "Edited by staff", the same mechanism as a recount.
// Product details (name, brand, unit, category, source, doesn't-expire) are
// plain fields on the product. A best-by change applies to the batches that
// still have units on the shelf.
import type { InventoryRow } from "@/lib/db/app-types";
import type { BatchRec, LedgerRec } from "@/lib/db/store";
import { correctionKey } from "@/lib/corrections";
import { categoryGroup, normalizeCategory } from "@/lib/items/taxonomy";
import { reasonLabel } from "@/lib/takeout";
import { COMMUNITY_LABEL } from "@/lib/labels";

export const EDIT_REASON = "Edited by staff";

/** What staff changed. Omitted fields stay as they are. */
export interface ProductEdit {
  name?: string;
  brand?: string | null;
  unit?: string;
  category?: string;
  source?: "donated" | "purchased" | null;
  noExpire?: boolean;
  /** The number staff see on the shelf now. Becomes an adjustment, never a stored value. */
  onShelf?: number;
  /** Best by for what is on the shelf now (ISO), or null for "no date". */
  expiresOn?: string | null;
}

export interface ProductDetails {
  productKey: string;
  name: string;
  brand: string | null;
  unit: string;
  category: string;
  categoryGroup: string | null;
  source: "donated" | "purchased" | null;
  noExpire: boolean;
}

export interface EditPlan {
  /** New product fields, or null when none of them changed. */
  details: ProductDetails | null;
  /** Signed ledger adjustment for on-shelf (0 = none). */
  delta: number;
  /** New expiry for the batches still on the shelf; undefined = leave dates alone. */
  expiresOn: string | null | undefined;
  /** Plain labels of what changed, in field order, for the history line. */
  changed: string[];
}

export const ON_SHELF_LABEL = "on the shelf";
export const BEST_BY_LABEL = "best by";
const LABELS = {
  name: "name",
  brand: "brand",
  unit: "unit",
  category: "category",
  source: "source",
  noExpire: "doesn't expire",
  expiresOn: BEST_BY_LABEL,
} as const;

/** Compare an edit with the current row and decide exactly what to write. */
export function planEdit(row: InventoryRow, edit: ProductEdit): EditPlan {
  const name = edit.name !== undefined && edit.name.trim() ? edit.name.trim() : row.name;
  const brand = edit.brand !== undefined ? edit.brand?.trim() || null : row.brand;
  const unit = edit.unit !== undefined && edit.unit.trim() ? edit.unit.trim() : row.unit;
  const category = edit.category !== undefined ? normalizeCategory(edit.category) : row.category;
  const source = edit.source !== undefined ? edit.source : row.source;
  const noExpire = edit.noExpire ?? row.noExpire;

  const changed: string[] = [];
  if (name !== row.name) changed.push(LABELS.name);
  if (brand !== row.brand) changed.push(LABELS.brand);
  if (unit !== row.unit) changed.push(LABELS.unit);
  if (category !== row.category) changed.push(LABELS.category);
  if (source !== row.source) changed.push(LABELS.source);
  if (noExpire !== row.noExpire) changed.push(LABELS.noExpire);

  const details: ProductDetails | null = changed.length
    ? {
        productKey: name !== row.name || brand !== row.brand ? correctionKey(name, brand) : row.productKey,
        name,
        brand,
        unit,
        category,
        categoryGroup: categoryGroup(category),
        source,
        noExpire,
      }
    : null;

  // "Doesn't expire" clears the date; otherwise a typed date replaces the shown one.
  let expiresOn: string | null | undefined;
  if (noExpire && !row.noExpire && row.expiresOn) expiresOn = null;
  else if (!noExpire && edit.expiresOn !== undefined && edit.expiresOn !== row.expiresOn) expiresOn = edit.expiresOn;
  if (expiresOn !== undefined) changed.push(LABELS.expiresOn);

  const delta =
    edit.onShelf !== undefined && Number.isFinite(edit.onShelf) ? Math.max(0, Math.round(edit.onShelf)) - row.onShelf : 0;
  if (delta !== 0) changed.unshift(ON_SHELF_LABEL);

  return { details, delta, expiresOn, changed };
}

// ---- history (PD.7: "recent history" in the drawer) ----

export interface HistoryEntry {
  /** ISO timestamp. */
  at: string;
  text: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function batchText(b: BatchRec): string {
  if (b.idempotencyKey?.startsWith("pickup:")) return `${b.quantity} arrived through ${COMMUNITY_LABEL}`;
  const how = b.dateSource === "photo" ? " (photo)" : b.dateSource === "typed" ? " (typed)" : "";
  return `Added ${b.quantity}${how}`;
}

function ledgerText(l: LedgerRec): string {
  const n = Math.abs(l.delta);
  switch (l.kind) {
    case "takeout":
      return l.source === "system" ? `${n} went out earlier` : `${n} taken via QR`;
    case "removal":
      return `${n} removed by staff · ${reasonLabel(l.reason) ?? "Other"}`;
    case "fix":
      return l.delta > 0 ? `Entry fixed: ${n} put back` : `Entry fixed: ${n} more out`;
    case "recount":
      if (l.reason?.startsWith(EDIT_REASON)) {
        return l.delta === 0 ? l.reason : `${EDIT_REASON}: ${ON_SHELF_LABEL} ${signed(l.delta)}`;
      }
      return `Recount ${signed(l.delta)}`;
    case "community_out":
      return `${n} picked up through ${COMMUNITY_LABEL}`;
    case "community_in":
      return `${n} arrived through ${COMMUNITY_LABEL}`;
  }
}

/** Newest-first history for one product's batches and ledger rows. */
export function historyEntries(batches: BatchRec[], ledger: LedgerRec[], limit = 8): HistoryEntry[] {
  const all: HistoryEntry[] = [
    ...batches.map((b) => ({ at: b.createdAt, text: batchText(b) })),
    ...ledger.map((l) => ({ at: l.createdAt, text: ledgerText(l) })),
  ];
  return all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}
