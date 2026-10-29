import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { InventoryRow } from "@/lib/db/app-types";
import type { BatchRec, LedgerRec } from "@/lib/db/store";
import { EDIT_REASON, historyEntries, planEdit } from "./edit";
import { offerTarget, removePreset, toggleAll, toggleOne } from "./selection";

const base: InventoryRow = {
  productId: "p1",
  campusId: "harbor",
  productKey: "canned corn|valley farms",
  name: "Canned corn",
  brand: "Valley Farms",
  unit: "can",
  category: "Canned Goods",
  categoryGroup: "Meal Essentials",
  source: "purchased",
  noExpire: false,
  onShelf: 5,
  reserved: 0,
  lastRestock: 24,
  lastRestockOn: "2026-06-15",
  expiresOn: "2027-05-01",
  status: "good",
};

describe("planEdit (PD.7a)", () => {
  it("PD.7a the adjustment is always new minus current, never an overwrite", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 0, max: 999 }), (current, next) => {
        const plan = planEdit({ ...base, onShelf: current }, { onShelf: next });
        expect(plan.delta).toBe(next - current);
        expect(plan.changed.includes("on the shelf")).toBe(next !== current);
      }),
    );
  });

  it("sending the current values plans nothing", () => {
    const plan = planEdit(base, { name: " Canned corn ", brand: "Valley Farms", onShelf: 5, expiresOn: "2027-05-01" });
    expect(plan).toEqual({ details: null, delta: 0, expiresOn: undefined, changed: [] });
  });

  it("a rename recomputes the product key; other detail edits keep it", () => {
    expect(planEdit(base, { name: "Sweet corn" }).details?.productKey).toBe("sweet corn|valley farms");
    expect(planEdit(base, { unit: "tin" }).details?.productKey).toBe(base.productKey);
  });

  it("unknown categories become Uncategorized and the group follows the category", () => {
    expect(planEdit(base, { category: "nonsense" }).details).toMatchObject({ category: "Uncategorized", categoryGroup: null });
    expect(planEdit(base, { category: "cereal" }).details).toMatchObject({ category: "Cereal", categoryGroup: "Meal Essentials" });
  });

  it("'Doesn't expire' clears the date and ignores a typed one", () => {
    const plan = planEdit(base, { noExpire: true, expiresOn: "2028-01-01" });
    expect(plan.expiresOn).toBeNull();
    expect(plan.changed).toEqual(["doesn't expire", "best by"]);
  });
});

describe("historyEntries", () => {
  const batch = (over: Partial<BatchRec>): BatchRec => ({
    id: "b1", campusId: "harbor", productId: "p1", quantity: 24, receivedOn: "2026-06-15", expiresOn: null, dateType: null,
    datePrecision: null, dateSource: "photo", idempotencyKey: null, createdAt: "2026-06-15T10:00:00.000Z", ...over,
  });
  const led = (over: Partial<LedgerRec>): LedgerRec => ({
    id: "l1", campusId: "harbor", productId: "p1", delta: -2, kind: "takeout", source: "student", reason: null, groupId: null,
    idempotencyKey: null, createdAt: "2026-06-16T10:00:00.000Z", ...over,
  });

  it("lists newest first in plain words, and never names a person", () => {
    const h = historyEntries(
      [batch({})],
      [
        led({}),
        led({ id: "l2", kind: "removal", source: "staff", reason: "damaged", delta: -1, createdAt: "2026-06-17T10:00:00.000Z" }),
        led({ id: "l3", kind: "recount", source: "staff", reason: EDIT_REASON, delta: 3, createdAt: "2026-06-18T10:00:00.000Z" }),
      ],
    );
    expect(h.map((e) => e.text)).toEqual([
      `${EDIT_REASON}: on the shelf +3`,
      "1 removed by staff · Damaged",
      "2 taken via QR",
      "Added 24 (photo)",
    ]);
  });
});

describe("selection bar (PD.8)", () => {
  const rows: InventoryRow[] = [
    { ...base, productId: "a", status: "expired", onShelf: 4 },
    { ...base, productId: "b", onShelf: 6, reserved: 2 },
    { ...base, productId: "c", onShelf: 0, status: "out" },
  ];

  it("select all toggles only the visible rows", () => {
    expect(toggleAll(["x"], ["a", "b"])).toEqual(["x", "a", "b"]);
    expect(toggleAll(["x", "a", "b"], ["a", "b"])).toEqual(["x"]);
    expect(toggleOne(["a"], "a")).toEqual([]);
  });

  it("Remove starts expired items at everything on the shelf and others at 1; empty items are left out", () => {
    expect(removePreset(rows, ["a"])).toEqual({ lines: [{ productId: "a", qty: 4 }], reason: "expired" });
    expect(removePreset(rows, ["a", "b", "c"])).toEqual({
      lines: [
        { productId: "a", qty: 4 },
        { productId: "b", qty: 1 },
      ],
      reason: "given_out",
    });
  });

  it("Offer on Community skips expired and empty items", () => {
    expect(offerTarget(rows, ["a", "c", "b"])).toBe("b");
    expect(offerTarget(rows, ["a", "c"])).toBeNull();
  });
});
