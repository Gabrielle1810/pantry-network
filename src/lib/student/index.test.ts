import { describe, expect, it } from "vitest";
import {
  REPEAT_WINDOW_MS,
  cartLines,
  cartTotal,
  filterStudentRows,
  isRepeatSubmission,
  isStudentVisible,
  setCart,
  studentAvailable,
} from "./index";

describe("isRepeatSubmission (2 minutes)", () => {
  const now = Date.parse("2026-10-24T15:00:00Z");
  it("no earlier submission → not a repeat", () => {
    expect(isRepeatSubmission(null, now)).toBe(false);
  });
  it("inside the window → repeat; at or after it → fine", () => {
    expect(isRepeatSubmission(new Date(now - REPEAT_WINDOW_MS + 1).toISOString(), now)).toBe(true);
    expect(isRepeatSubmission(new Date(now - REPEAT_WINDOW_MS).toISOString(), now)).toBe(false);
    expect(isRepeatSubmission(new Date(now - 5 * 60_000).toISOString(), now)).toBe(false);
  });
});

describe("what students can see (PO.4)", () => {
  it("hides expired, empty and fully reserved items; reserved units are not available", () => {
    expect(studentAvailable({ onShelf: 10, reserved: 4 })).toBe(6);
    expect(studentAvailable({ onShelf: 2, reserved: 5 })).toBe(0);
    expect(isStudentVisible({ onShelf: 10, reserved: 4, status: "good" })).toBe(true);
    expect(isStudentVisible({ onShelf: 10, reserved: 0, status: "expired" })).toBe(false);
    expect(isStudentVisible({ onShelf: 0, reserved: 0, status: "out" })).toBe(false);
    expect(isStudentVisible({ onShelf: 3, reserved: 3, status: "good" })).toBe(false);
  });

  it("filters by group chip and search, soon-expiring first", () => {
    const rows = [
      { name: "Ramen", category: "Microwave cup/package", status: "good" as const },
      { name: "Tuna", category: "Dried/Canned Meats/Protein", status: "soon" as const },
      { name: "Beans", category: "Canned Goods", status: "good" as const },
    ];
    expect(filterStudentRows(rows, "Meal Essentials", "").map((r) => r.name)).toEqual(["Tuna", "Beans"]);
    expect(filterStudentRows(rows, null, "ram").map((r) => r.name)).toEqual(["Ramen"]);
  });
});

describe("cart", () => {
  it("caps at the max, removes at zero, and totals", () => {
    let cart = setCart({}, "a", 99, 3);
    expect(cart).toEqual({ a: 3 });
    cart = setCart(cart, "b", 2, 5);
    expect(cartTotal(cart)).toBe(5);
    expect(cartLines(setCart(cart, "a", 0, 3))).toEqual([{ productId: "b", qty: 2 }]);
  });
});
