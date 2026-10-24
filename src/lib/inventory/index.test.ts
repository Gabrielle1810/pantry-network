import { describe, expect, it } from "vitest";
import { inventoryCards, tabCounts, filterRows, stockTone } from "./index";
import type { InventoryRow } from "@/lib/db/app-types";
import type { Status } from "@/lib/status";

const TODAY = "2026-10-24";

function row(partial: Partial<InventoryRow> & { name: string; status: Status }): InventoryRow {
  return {
    productId: partial.name,
    campusId: "harbor",
    productKey: partial.name.toLowerCase(),
    name: partial.name,
    brand: partial.brand ?? null,
    unit: partial.unit ?? "can",
    category: partial.category ?? "Canned Goods",
    categoryGroup: null,
    source: partial.source ?? "donated",
    noExpire: partial.noExpire ?? false,
    onShelf: partial.onShelf ?? 5,
    reserved: partial.reserved ?? 0,
    lastRestock: partial.lastRestock ?? 10,
    lastRestockOn: partial.lastRestockOn ?? "2026-06-01",
    expiresOn: partial.expiresOn ?? null,
    status: partial.status,
  };
}

describe("tabCounts & filterRows", () => {
  const rows = [
    row({ name: "A", status: "low", onShelf: 1, source: "donated" }),
    row({ name: "B", status: "expired", expiresOn: "2026-10-01", source: "purchased" }),
    row({ name: "C", status: "soon", expiresOn: "2026-10-28", source: "donated" }),
    row({ name: "D", status: "good", source: "purchased" }),
  ];
  it("counts each tab", () => {
    const c = tabCounts(rows);
    expect(c.all).toBe(4);
    expect(c.donated).toBe(2);
    expect(c.purchased).toBe(2);
    expect(c.low).toBe(1);
    expect(c.soon).toBe(1);
    expect(c.expired).toBe(1);
  });
  it("filters by tab and search", () => {
    expect(filterRows(rows, "expired", "").map((r) => r.name)).toEqual(["B"]);
    // Search matches name/brand/category (case-insensitive substring).
    const named = [
      row({ name: "Ramen noodles", status: "good" }),
      row({ name: "Black beans", status: "good" }),
    ];
    expect(filterRows(named, "all", "ramen").map((r) => r.name)).toEqual(["Ramen noodles"]);
    expect(filterRows(named, "all", "beans").map((r) => r.name)).toEqual(["Black beans"]);
  });
});

describe("inventoryCards", () => {
  const rows = [
    row({ name: "Cheerios", status: "out", onShelf: 0, lastRestock: 12 }),
    row({ name: "Tomato paste", status: "soon", onShelf: 2, lastRestock: 4, expiresOn: "2026-10-26" }),
    row({ name: "Sauce", status: "expired", expiresOn: "2026-08-30" }),
  ];
  it("builds the four cards with the right leads", () => {
    const cards = inventoryCards(rows, TODAY);
    expect(cards).toHaveLength(4);
    expect(cards[0].label).toBe("Running low");
    expect(cards[0].title).toContain("Cheerios");
    expect(cards[1].label).toBe("Expiring soon");
    expect(cards[1].title).toContain("Tomato paste");
    expect(cards[2].label).toBe("Expired");
    expect(cards[2].num).toBe(1);
    expect(cards[3].label).toBe("Items this period");
    expect(cards[3].num).toBe(3);
    // PD.2: "Add items" on Running low opens Add stock prefilled with that product.
    expect(cards[0].actions?.[0]).toEqual({ label: "Add items", href: "/add?product=Cheerios", primary: true });
  });
});

describe("stockTone", () => {
  it("green ≥ 50%, amber ≥ 25%, red below", () => {
    expect(stockTone(6, 10)).toBe("g");
    expect(stockTone(3, 10)).toBe("a");
    expect(stockTone(1, 10)).toBe("r");
  });
});
