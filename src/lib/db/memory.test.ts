import { describe, expect, it } from "vitest";
import { MemoryRepository } from "./memory";
import type { SaveBatchInput } from "./types";

function input(overrides: Partial<SaveBatchInput> = {}): SaveBatchInput {
  return {
    campusId: "campus-a",
    idempotencyKey: null,
    receivedOn: "2026-10-24",
    arrivedExpired: false,
    editedFields: [],
    read: null,
    batch: {
      name: "Test item",
      brand: null,
      size_text: null,
      category: "Uncategorized",
      category_group: null,
      quantity: 3,
      unit: "item",
      expires_on: null,
      date_type: null,
      date_precision: null,
      date_source: null,
      dont_track: false,
      doesnt_expire: false,
      perishable: false,
      source: null,
    },
    ...overrides,
  };
}

describe("MemoryRepository", () => {
  it("saves then lists today's batches", async () => {
    const repo = new MemoryRepository(false);
    const saved = await repo.saveBatch(input());
    const list = await repo.listBatches("campus-a", "today", "2026-10-24");
    expect(list.map((b) => b.id)).toContain(saved.id);
  });

  it("UI13.3 double-submit with the same idempotency key returns the existing batch", async () => {
    const repo = new MemoryRepository(false);
    const a = await repo.saveBatch(input({ idempotencyKey: "key-1" }));
    const b = await repo.saveBatch(input({ idempotencyKey: "key-1", batch: { ...input().batch, quantity: 99 } }));
    expect(b.id).toBe(a.id);
    expect(b.quantity).toBe(3); // original, not the second attempt
    const list = await repo.listBatches("campus-a", "today", "2026-10-24");
    expect(list.filter((x) => x.idempotency_key === "key-1")).toHaveLength(1);
  });

  it("round-trips a product correction", async () => {
    const repo = new MemoryRepository(false);
    await repo.saveCorrection("campus-a", "tomato pase|hunts", {
      name: "Tomato paste",
      brand: "Hunt's",
      category: "Sauces/Pastes/Spread",
    });
    const got = await repo.getCorrection("campus-a", "tomato pase|hunts");
    expect(got?.name).toBe("Tomato paste");
    expect(await repo.getCorrection("campus-a", "unknown|key")).toBeNull();
  });

  it("filters list by received_on floor", async () => {
    const repo = new MemoryRepository(false);
    await repo.saveBatch(input({ receivedOn: "2026-10-20" }));
    await repo.saveBatch(input({ receivedOn: "2026-10-24" }));
    const todayOnly = await repo.listBatches("campus-a", "today", "2026-10-24");
    expect(todayOnly).toHaveLength(1);
  });
});
