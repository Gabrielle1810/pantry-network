import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { statusOf, SOON_DAYS, type Status } from "./index";

const TODAY = "2026-10-24";

describe("statusOf precedence (PB.3)", () => {
  it("expired beats everything", () => {
    expect(statusOf({ onShelf: 0, lastRestock: 10, soonestDate: "2026-10-20", noExpire: false }, TODAY)).toBe("expired");
  });
  it("out when nothing on shelf and no past date", () => {
    expect(statusOf({ onShelf: 0, lastRestock: 10, soonestDate: null, noExpire: false }, TODAY)).toBe("out");
  });
  it("soon within the 14-day window (boundary)", () => {
    expect(statusOf({ onShelf: 5, lastRestock: 10, soonestDate: "2026-11-07", noExpire: false }, TODAY)).toBe("soon"); // 14 days
    expect(statusOf({ onShelf: 5, lastRestock: 10, soonestDate: "2026-11-08", noExpire: false }, TODAY)).not.toBe("soon"); // 15 days
  });
  it("low when under a quarter of last restock", () => {
    expect(statusOf({ onShelf: 2, lastRestock: 10, soonestDate: null, noExpire: true }, TODAY)).toBe("low"); // 2 < 2.5
    expect(statusOf({ onShelf: 3, lastRestock: 10, soonestDate: null, noExpire: true }, TODAY)).toBe("good"); // 3 >= 2.5
  });
  it("nodate when no date and not noExpire", () => {
    expect(statusOf({ onShelf: 8, lastRestock: 10, soonestDate: null, noExpire: false }, TODAY)).toBe("nodate");
  });
  it("good otherwise (dated, healthy stock)", () => {
    expect(statusOf({ onShelf: 8, lastRestock: 10, soonestDate: "2027-06-01", noExpire: false }, TODAY)).toBe("good");
  });
});

describe("PO.3 property: statusOf returns exactly one valid status", () => {
  const all: Status[] = ["expired", "out", "soon", "low", "nodate", "good"];
  it("for arbitrary inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        fc.option(fc.integer({ min: -400, max: 400 }), { nil: null }),
        fc.boolean(),
        (onShelf, lastRestock, dayOffset, noExpire) => {
          const soonestDate =
            dayOffset === null ? null : isoPlus(TODAY, dayOffset);
          const s = statusOf({ onShelf, lastRestock, soonestDate, noExpire }, TODAY);
          expect(all).toContain(s);
          // Precedence spot-checks:
          if (soonestDate && dayOffset! < 0) expect(s).toBe("expired");
          else if (onShelf === 0) expect(s).toBe("out");
          else if (soonestDate && dayOffset! <= SOON_DAYS) expect(s).toBe("soon");
        },
      ),
    );
  });
});

function isoPlus(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
