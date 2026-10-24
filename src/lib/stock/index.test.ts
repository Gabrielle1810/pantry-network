import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  activeSoonestExpiry,
  deriveOnShelf,
  consumeFIFO,
  lastRestockAmount,
  soonestExpiry,
  sortFIFO,
  type Batch,
  type Ledger,
} from "./index";

function batch(id: string, qty: number, receivedOn: string, createdAt = `${receivedOn}T10:00:00Z`): Batch {
  return { id, productKey: "p", quantity: qty, receivedOn, createdAt, expiresOn: null };
}
function ledger(id: string, delta: number, kind: Ledger["kind"] = "takeout"): Ledger {
  return { id, productKey: "p", delta, kind, at: "2026-10-24T10:00:00Z", createdAt: "2026-10-24T10:00:00Z" };
}

describe("deriveOnShelf", () => {
  it("sums batches plus ledger deltas", () => {
    expect(deriveOnShelf([batch("b1", 10, "2026-10-01")], [ledger("l1", -3)])).toBe(7);
  });
  it("floors at 0 (never negative, PO.1)", () => {
    expect(deriveOnShelf([batch("b1", 2, "2026-10-01")], [ledger("l1", -5)])).toBe(0);
  });
  it("community_in adds", () => {
    expect(deriveOnShelf([batch("b1", 4, "2026-10-01")], [ledger("l1", 6, "community_in")])).toBe(10);
  });
});

describe("PO.1 property: derived stock is sum of ledger and never negative", () => {
  it("holds for arbitrary batches and ledger entries", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 999 }), { maxLength: 8 }),
        fc.array(fc.integer({ min: -999, max: 999 }), { maxLength: 20 }),
        (batchQtys, deltas) => {
          const batches = batchQtys.map((q, i) => batch(`b${i}`, q, `2026-10-${String((i % 28) + 1).padStart(2, "0")}`));
          const ledgers = deltas.map((d, i) => ledger(`l${i}`, d));
          const onShelf = deriveOnShelf(batches, ledgers);
          const expected = Math.max(0, batchQtys.reduce((a, b) => a + b, 0) + deltas.reduce((a, b) => a + b, 0));
          expect(onShelf).toBe(expected);
          expect(onShelf).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe("PO.2 consumeFIFO (oldest batch first)", () => {
  it("consumes the oldest received batch first", () => {
    const batches = [
      batch("new", 5, "2026-10-10"),
      batch("old", 5, "2026-10-01"),
      batch("mid", 5, "2026-10-05"),
    ];
    const result = consumeFIFO(batches, 7);
    expect(result).toEqual([
      { batchId: "old", consumed: 5 },
      { batchId: "mid", consumed: 2 },
    ]);
  });
  it("never consumes more than available", () => {
    const batches = [batch("a", 3, "2026-10-01")];
    const total = consumeFIFO(batches, 100).reduce((s, c) => s + c.consumed, 0);
    expect(total).toBe(3);
  });
  it("property: total consumed = min(qty, available) and order is oldest-first", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 0, max: 400 }),
        (qtys, want) => {
          const batches = qtys.map((q, i) => batch(`b${i}`, q, `2026-10-${String(i + 1).padStart(2, "0")}`));
          const res = consumeFIFO(batches, want);
          const available = qtys.reduce((a, b) => a + b, 0);
          expect(res.reduce((s, c) => s + c.consumed, 0)).toBe(Math.min(want, available));
          const order = res.map((r) => r.batchId);
          const fifoOrder = sortFIFO(batches).map((b) => b.id).filter((id) => order.includes(id));
          expect(order).toEqual(fifoOrder);
        },
      ),
    );
  });
});

describe("activeSoonestExpiry", () => {
  const old = { ...batch("old", 2, "2026-09-01"), expiresOn: "2026-09-10" };
  const fresh = { ...batch("new", 5, "2026-10-20"), expiresOn: "2027-01-01" };

  it("ignores batches that are fully used up", () => {
    expect(activeSoonestExpiry([old, fresh], [ledger("l", -2)])).toBe("2027-01-01");
  });
  it("keeps a batch that still has units", () => {
    expect(activeSoonestExpiry([old, fresh], [ledger("l", -1)])).toBe("2026-09-10");
  });
  it("is null once nothing dated is left", () => {
    expect(activeSoonestExpiry([old], [ledger("l", -2)])).toBeNull();
  });
});

describe("lastRestockAmount & soonestExpiry", () => {
  it("lastRestockAmount is the most recent batch's quantity", () => {
    const batches = [batch("a", 4, "2026-10-01"), batch("b", 9, "2026-10-20")];
    expect(lastRestockAmount(batches)).toBe(9);
    expect(lastRestockAmount([])).toBe(0);
  });
  it("soonestExpiry returns the earliest non-null date", () => {
    const b1 = { ...batch("a", 1, "2026-10-01"), expiresOn: "2027-01-01" };
    const b2 = { ...batch("b", 1, "2026-10-02"), expiresOn: "2026-12-01" };
    expect(soonestExpiry([b1, b2])).toBe("2026-12-01");
    expect(soonestExpiry([batch("c", 1, "2026-10-01")])).toBeNull();
  });
});
