import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { LedgerRec } from "@/lib/db/store";
import {
  addLine,
  agoLabel,
  buildFeed,
  clampLines,
  dropLine,
  feedStats,
  filterFeed,
  mergeLines,
  outTodaySub,
  planFix,
  recordLabel,
  setLineQty,
  sourceLabel,
  type FeedEntry,
} from "./index";

const TZ = "America/New_York";
const TODAY = "2026-10-24";
const NOON = "2026-10-24T16:00:00.000Z"; // 12:00 in New York

const products = new Map([
  ["beans", { name: "Black beans", category: "Canned Goods" }],
  ["ramen", { name: "Ramen noodles", category: "Microwave cup/package" }],
]);

function row(over: Partial<LedgerRec>): LedgerRec {
  return {
    id: Math.random().toString(),
    campusId: "harbor",
    productId: "beans",
    delta: -1,
    kind: "removal",
    source: "staff",
    reason: "given_out",
    groupId: "g1",
    idempotencyKey: null,
    createdAt: NOON,
    ...over,
  };
}

describe("clampLines / mergeLines", () => {
  it("merges duplicates and drops non-positive or fractional quantities", () => {
    expect(mergeLines([{ productId: "a", qty: 2 }, { productId: "a", qty: 3 }, { productId: "b", qty: 0 }, { productId: "c", qty: 1.5 }])).toEqual([
      { productId: "a", qty: 5 },
    ]);
  });
  it("caps at what is available and drops unknown products", () => {
    const out = clampLines(
      [{ productId: "a", qty: 9 }, { productId: "ghost", qty: 1 }, { productId: "b", qty: 2 }],
      new Map([["a", 4], ["b", 0]]),
    );
    expect(out).toEqual([{ productId: "a", qty: 4 }]);
  });
  it("property: never returns more than available, and every quantity is a positive integer", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ productId: fc.constantFrom("a", "b", "c"), qty: fc.integer({ min: -5, max: 500 }) }), { maxLength: 12 }),
        fc.record({ a: fc.integer({ min: 0, max: 100 }), b: fc.integer({ min: 0, max: 100 }), c: fc.integer({ min: 0, max: 100 }) }),
        (lines, avail) => {
          const out = clampLines(lines, new Map(Object.entries(avail)));
          for (const l of out) {
            expect(Number.isInteger(l.qty)).toBe(true);
            expect(l.qty).toBeGreaterThan(0);
            expect(l.qty).toBeLessThanOrEqual(avail[l.productId as "a" | "b" | "c"]);
          }
        },
      ),
    );
  });
});

describe("buildFeed (no names, netted by fix rows)", () => {
  it("shows only source, reason, products and quantities", () => {
    const feed = buildFeed({
      ledger: [row({ delta: -2 }), row({ groupId: "g2", source: "student", kind: "takeout", reason: null, productId: "ramen", delta: -1 })],
      products,
      held: [],
      todayIso: TODAY,
      tz: TZ,
    });
    expect(feed).toHaveLength(2);
    for (const e of feed) {
      expect(Object.keys(e).sort()).toEqual(["at", "id", "kind", "lines", "reason", "source"]);
      for (const l of e.lines) expect(Object.keys(l).sort()).toEqual(["category", "name", "productId", "qty"]);
    }
    expect(sourceLabel(feed.find((e) => e.source === "student")!)).toBe("Student scan");
    expect(sourceLabel(feed.find((e) => e.source === "staff")!)).toBe("Staff");
  });

  it("a fix row lowers the quantity; an entry netted to zero disappears", () => {
    const base = [row({ delta: -3 })];
    const fixed = buildFeed({ ledger: [...base, row({ kind: "fix", delta: 1 })], products, held: [], todayIso: TODAY, tz: TZ });
    expect(fixed[0].lines[0].qty).toBe(2);
    const gone = buildFeed({ ledger: [...base, row({ kind: "fix", delta: 3 })], products, held: [], todayIso: TODAY, tz: TZ });
    expect(gone).toHaveLength(0);
  });

  it("ignores system baseline rows, recounts, Community moves and other days", () => {
    const feed = buildFeed({
      ledger: [
        row({ source: "system", groupId: null }),
        row({ kind: "recount", groupId: "g9" }),
        row({ kind: "community_out", groupId: "g8" }),
        row({ groupId: "old", createdAt: "2026-10-22T16:00:00.000Z" }),
      ],
      products,
      held: [],
      todayIso: TODAY,
      tz: TZ,
    });
    expect(feed).toEqual([]);
  });

  it("includes held submissions until staff resolve them, and filters by source", () => {
    const feed = buildFeed({
      ledger: [row({})],
      products,
      held: [
        { id: "h1", campusId: "harbor", deviceId: "dev", submissionId: "s1", lines: [{ productId: "ramen", qty: 2 }], status: "held", createdAt: "2026-10-23T10:00:00.000Z" },
        { id: "h2", campusId: "harbor", deviceId: "dev", submissionId: "s2", lines: [{ productId: "ramen", qty: 2 }], status: "discarded", createdAt: NOON },
      ],
      todayIso: TODAY,
      tz: TZ,
    });
    expect(feed.map((e) => e.kind).sort()).toEqual(["held", "recorded"]);
    expect(filterFeed(feed, "students").map((e) => e.kind)).toEqual(["held"]);
    expect(filterFeed(feed, "staff").map((e) => e.kind)).toEqual(["recorded"]);
  });
});

describe("feedStats", () => {
  const entry = (over: Partial<FeedEntry>): FeedEntry => ({
    id: "x", kind: "recorded", at: NOON, source: "student", reason: null,
    lines: [{ productId: "ramen", name: "Ramen noodles", category: "Microwave cup/package", qty: 4 }], ...over,
  });
  const rows = [{ productId: "ramen", name: "Ramen noodles", category: "Microwave cup/package", unit: "cup", onShelf: 8 }];

  it("splits students and staff, counts reasons, and finds the most taken product", () => {
    const s = feedStats(
      [entry({}), entry({ id: "y", source: "staff", reason: "expired", lines: [{ productId: "ramen", name: "Ramen noodles", category: "x", qty: 2 }] }), entry({ id: "z", kind: "held" })],
      rows,
    );
    expect(s.byStudents).toBe(4); // the held entry is not counted
    expect(s.byStaff).toBe(2);
    expect(s.total).toBe(6);
    expect(s.reasons).toEqual({ expired: 2 });
    expect(s.top).toMatchObject({ name: "Ramen noodles", taken: 4, daysLeft: 2 });
    expect(outTodaySub(s)).toBe("4 taken by students · 2 removed by staff (2 expired)");
  });
});

describe("planFix", () => {
  const current = [{ productId: "a", name: "A", category: "c", qty: 3 }];
  it("returns the difference, putting units back when the quantity goes down", () => {
    expect(planFix(current, [{ productId: "a", qty: 1 }], new Map([["a", 5]]))).toEqual([{ productId: "a", delta: 2 }]);
  });
  it("can take more, but only up to what is still available", () => {
    expect(planFix(current, [{ productId: "a", qty: 99 }], new Map([["a", 2]]))).toEqual([{ productId: "a", delta: -2 }]);
  });
  it("deleting (0) puts everything back; no change returns nothing", () => {
    expect(planFix(current, [{ productId: "a", qty: 0 }], new Map())).toEqual([{ productId: "a", delta: 3 }]);
    expect(planFix(current, [{ productId: "a", qty: 3 }], new Map())).toEqual([]);
  });
});

describe("agoLabel", () => {
  const now = "2026-10-24T16:00:00.000Z";
  it("reads like the prototype", () => {
    expect(agoLabel("2026-10-24T15:59:40.000Z", now)).toBe("Just now");
    expect(agoLabel("2026-10-24T15:17:00.000Z", now)).toBe("43 min ago");
    expect(agoLabel("2026-10-24T15:00:00.000Z", now)).toBe("1 hour ago");
    expect(agoLabel("2026-10-24T12:00:00.000Z", now)).toBe("4 hours ago");
    expect(agoLabel("2026-10-23T12:00:00.000Z", now)).toBe("Yesterday");
  });
});

describe("record modal line helpers", () => {
  it("clamps quantity to the cap and never adds a capped-out or duplicate product", () => {
    let lines = addLine([], "a", 5);
    expect(lines).toEqual([{ productId: "a", qty: 1 }]);
    expect(addLine(lines, "a", 5)).toBe(lines);
    expect(addLine(lines, "b", 0)).toBe(lines);
    lines = setLineQty(lines, "a", 99, 5);
    expect(lines[0].qty).toBe(5);
    expect(setLineQty(lines, "a", -3, 5)[0].qty).toBe(0);
    expect(dropLine(lines, "a")).toEqual([]);
  });
  it("labels the button", () => {
    expect(recordLabel(1)).toBe("Record 1 item");
    expect(recordLabel(14)).toBe("Record 14 items");
  });
});
