import { describe, expect, it } from "vitest";
import { inventoryTotals } from "./index";
import type { ItemBatch } from "@/lib/items/schema";

function batch(name: string, brand: string | null, quantity: number): ItemBatch {
  return {
    id: `${name}-${brand}-${quantity}-${Math.random()}`,
    campus_id: "campus-a",
    idempotency_key: null,
    name,
    brand,
    size_text: null,
    category: "Uncategorized",
    category_group: null,
    quantity,
    unit: "can",
    received_on: "2026-10-24",
    expires_on: null,
    date_type: null,
    date_precision: null,
    date_source: null,
    dont_track: false,
    doesnt_expire: false,
    perishable: false,
    arrived_expired: false,
    source: null,
    edited_fields: [],
    created_at: "2026-10-24T00:00:00.000Z",
  };
}

describe("UI10 inventoryTotals", () => {
  it("before + added = after, grouped by normalized name+brand", () => {
    const existing = [
      batch("Tomato paste", "Hunt's", 2),
      batch("tomato  paste", "HUNT'S", 3), // same product, case/space variation
      batch("Black beans", "Campus Brand", 6), // different product
    ];
    const t = inventoryTotals(existing, "Tomato paste", "Hunt's", 4);
    expect(t).toEqual({ before: 5, added: 4, after: 9, firstBatch: false });
  });

  it("first batch (before 0) → firstBatch true", () => {
    const t = inventoryTotals([], "New item", null, 1);
    expect(t).toEqual({ before: 0, added: 1, after: 1, firstBatch: true });
  });

  it("ignores unrelated products entirely", () => {
    const existing = [batch("Cereal", "A", 10)];
    const t = inventoryTotals(existing, "Pasta", "B", 2);
    expect(t.before).toBe(0);
    expect(t.after).toBe(2);
  });
});
