import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { todayInTz } from "@/lib/dates";
import { AppService } from "./service";
import { MemoryStore } from "./store-memory";
import { REPEAT_WINDOW_MS } from "@/lib/student";

const TODAY = todayInTz();

function setup() {
  const store = new MemoryStore(TODAY);
  return { store, repo: new AppService(store) };
}

const onShelf = async (repo: AppService, id: string, campus = "harbor") =>
  (await repo.getProduct(campus, id, TODAY))!.onShelf;

describe("seeded Out today feed", () => {
  it("shows today's entries with no names, and stock still matches data.js", async () => {
    const { repo } = setup();
    const feed = await repo.listFeed("harbor", TODAY);
    expect(feed.length).toBe(11);
    for (const e of feed) {
      expect(Object.keys(e).sort()).toEqual(["at", "id", "kind", "lines", "reason", "source"]);
      expect(["Student scan", "Staff"]).toContain(e.source === "student" ? "Student scan" : "Staff");
    }
    expect(await onShelf(repo, "harbor:ramen")).toBe(9); // 12 taken today is already inside this number
    expect(await onShelf(repo, "harbor:beans")).toBe(3);
  });
});

describe("staff Record items out", () => {
  it("subtracts stock, caps at what is on the shelf, and appears in the feed", async () => {
    const { repo } = setup();
    const r = await repo.recordOut(
      { campusId: "harbor", reason: "damaged", lines: [{ productId: "harbor:beans", qty: 99 }], idempotencyKey: "k1" },
      TODAY,
    );
    expect(r.status).toBe("recorded");
    expect(r.lines[0].qty).toBe(3); // only 3 on the shelf
    expect(await onShelf(repo, "harbor:beans")).toBe(0);
    const entry = (await repo.listFeed("harbor", TODAY)).find((e) => e.id === r.groupId);
    expect(entry).toMatchObject({ source: "staff", reason: "damaged" });
  });

  it("is idempotent: the same key records once", async () => {
    const { repo } = setup();
    const input = { campusId: "harbor", reason: "given_out" as const, lines: [{ productId: "harbor:rice", qty: 1 }], idempotencyKey: "same" };
    expect((await repo.recordOut(input, TODAY)).status).toBe("recorded");
    expect((await repo.recordOut(input, TODAY)).status).toBe("duplicate");
    expect(await onShelf(repo, "harbor:rice")).toBe(3);
  });

  it("fix A: 'Moved to Community' reserves but does NOT subtract; reserved units can't be removed or offered twice", async () => {
    const { repo } = setup();
    const moved = await repo.recordOut(
      { campusId: "harbor", reason: "moved_to_community", lines: [{ productId: "harbor:pb", qty: 100 }], idempotencyKey: null },
      TODAY,
    );
    expect(moved.groupId).toBeNull();
    expect(moved.offerIds).toHaveLength(1);
    const row = (await repo.getProduct("harbor", "harbor:pb", TODAY))!;
    expect(row.onShelf).toBe(150); // unchanged
    expect(row.reserved).toBe(100);

    // Only 50 are left to act on: a removal of 80 is capped at 50, and another offer too.
    const removal = await repo.recordOut(
      { campusId: "harbor", reason: "other", lines: [{ productId: "harbor:pb", qty: 80 }], idempotencyKey: null },
      TODAY,
    );
    expect(removal.lines[0].qty).toBe(50);
    const second = await repo.createOffer({ campusId: "harbor", productId: "harbor:pb", qty: 10, note: null }, TODAY);
    expect(second).toBeNull(); // nothing left that isn't reserved or removed
    // Students can't see reserved units either.
    const student = (await repo.listStudentInventory("harbor", TODAY)).find((r) => r.productId === "harbor:pb");
    expect(student).toBeUndefined();
  });

  it("withdrawing an offer releases the reservation with no stock change", async () => {
    const { repo } = setup();
    const made = await repo.createOffer({ campusId: "harbor", productId: "harbor:rice", qty: 3, note: null }, TODAY);
    expect((await repo.getProduct("harbor", "harbor:rice", TODAY))!.reserved).toBe(3);
    expect(await repo.withdrawOffer("harbor", made!.offerId)).toBe(true);
    const row = (await repo.getProduct("harbor", "harbor:rice", TODAY))!;
    expect(row.reserved).toBe(0);
    expect(row.onShelf).toBe(4);
  });

  it("expired food cannot be offered", async () => {
    const { repo } = setup();
    expect(await repo.createOffer({ campusId: "harbor", productId: "harbor:sauce", qty: 1, note: null }, TODAY)).toBeNull();
  });
});

describe("Fix, delete and Undo", () => {
  async function removeTwo(repo: AppService) {
    return repo.recordOut({ campusId: "harbor", reason: "other", lines: [{ productId: "harbor:rice", qty: 3 }], idempotencyKey: null }, TODAY);
  }

  it("Fix changes the quantity and stock moves by the difference", async () => {
    const { repo } = setup();
    const r = await removeTwo(repo);
    expect(await onShelf(repo, "harbor:rice")).toBe(1);
    await repo.fixEntry("harbor", r.groupId!, [{ productId: "harbor:rice", qty: 1 }], TODAY);
    expect(await onShelf(repo, "harbor:rice")).toBe(3);
    expect((await repo.listFeed("harbor", TODAY)).find((e) => e.id === r.groupId)!.lines[0].qty).toBe(1);
    // taking more is capped at what is still available
    await repo.fixEntry("harbor", r.groupId!, [{ productId: "harbor:rice", qty: 50 }], TODAY);
    expect(await onShelf(repo, "harbor:rice")).toBe(0);
  });

  it("deleting an entry puts its stock back and removes it from the feed", async () => {
    const { repo } = setup();
    const r = await removeTwo(repo);
    expect(await repo.deleteEntry("harbor", r.groupId!, TODAY)).toBe(true);
    expect(await onShelf(repo, "harbor:rice")).toBe(4);
    expect((await repo.listFeed("harbor", TODAY)).some((e) => e.id === r.groupId)).toBe(false);
  });

  it("Undo works right after recording, and not after the window or on student entries", async () => {
    const { repo } = setup();
    const r = await removeTwo(repo);
    expect(await repo.undoEntry("harbor", r.groupId, [], Date.now() + 10 * 60_000)).toBe(false); // too late
    expect(await onShelf(repo, "harbor:rice")).toBe(1);
    expect(await repo.undoEntry("harbor", r.groupId, [])).toBe(true);
    expect(await onShelf(repo, "harbor:rice")).toBe(4);
    const seededStudent = (await repo.listFeed("harbor", TODAY)).find((e) => e.source === "student")!;
    expect(await repo.undoEntry("harbor", seededStudent.id, [], Date.now())).toBe(false);
  });

  it("Undo of 'Moved to Community' withdraws the offers it made", async () => {
    const { repo } = setup();
    const moved = await repo.recordOut(
      { campusId: "harbor", reason: "moved_to_community", lines: [{ productId: "harbor:rice", qty: 2 }], idempotencyKey: null },
      TODAY,
    );
    expect(await repo.undoEntry("harbor", null, moved.offerIds)).toBe(true);
    expect((await repo.getProduct("harbor", "harbor:rice", TODAY))!.reserved).toBe(0);
  });
});

describe("public student take-out", () => {
  const NOW = Date.now();
  const take = (repo: AppService, over: Partial<{ deviceId: string; submissionId: string; productId: string; qty: number }> = {}, at = NOW) =>
    repo.studentTakeout(
      {
        campusId: "harbor",
        deviceId: over.deviceId ?? "device-1",
        submissionId: over.submissionId ?? "sub-1",
        lines: [{ productId: over.productId ?? "harbor:rice", qty: over.qty ?? 1 }],
      },
      TODAY,
      at,
    );

  it("records a take-out, capped at what students can take; names are not stored", async () => {
    const { repo, store } = setup();
    const r = await take(repo, { qty: 99 });
    expect(r.status).toBe("recorded");
    expect(r.lines[0].qty).toBe(4);
    expect(await onShelf(repo, "harbor:rice")).toBe(0);
    for (const row of await store.listLedger("harbor")) {
      expect(Object.keys(row).sort()).toEqual(
        ["campusId", "createdAt", "delta", "groupId", "id", "idempotencyKey", "kind", "productId", "reason", "source"],
      );
    }
  });

  it("is idempotent per submission", async () => {
    const { repo } = setup();
    await take(repo);
    const again = await take(repo);
    expect(again.status).toBe("recorded");
    expect(await onShelf(repo, "harbor:rice")).toBe(3);
  });

  it("never takes expired, empty or reserved items", async () => {
    const { repo } = setup();
    expect((await take(repo, { submissionId: "a", productId: "harbor:sauce" })).status).toBe("empty"); // expired
    expect((await take(repo, { submissionId: "b", productId: "harbor:oatcereal" })).status).toBe("empty"); // out
    await repo.createOffer({ campusId: "harbor", productId: "harbor:rice", qty: 4, note: null }, TODAY);
    expect((await take(repo, { submissionId: "c" })).status).toBe("empty"); // all reserved
  });

  it("fix C: a repeat from the same device inside 2 minutes is held with no stock change; Accept applies it, Discard does not", async () => {
    const { repo } = setup();
    await take(repo, { submissionId: "first" });
    const held = await take(repo, { submissionId: "second", qty: 2 }, NOW + 60_000);
    expect(held.status).toBe("held");
    expect(await onShelf(repo, "harbor:rice")).toBe(3); // unchanged by the held one

    const heldEntry = (await repo.listFeed("harbor", TODAY)).find((e) => e.kind === "held")!;
    expect(heldEntry.source).toBe("student");
    expect(await repo.resolveHeld("harbor", heldEntry.id, true, TODAY)).toBe(true);
    expect(await onShelf(repo, "harbor:rice")).toBe(1);
    expect((await repo.listFeed("harbor", TODAY)).some((e) => e.kind === "held")).toBe(false);

    const second = await take(repo, { deviceId: "device-1", submissionId: "third" }, NOW + 90_000);
    expect(second.status).toBe("held");
    const entry2 = (await repo.listFeed("harbor", TODAY)).find((e) => e.kind === "held")!;
    await repo.resolveHeld("harbor", entry2.id, false, TODAY);
    expect(await onShelf(repo, "harbor:rice")).toBe(1);
  });

  it("a retry of a held submission stays held, and a different device or a later time is recorded", async () => {
    const { repo } = setup();
    await take(repo, { submissionId: "first" });
    expect((await take(repo, { submissionId: "again" }, NOW + 30_000)).status).toBe("held");
    expect((await take(repo, { submissionId: "again" }, NOW + 31_000)).status).toBe("held");
    expect((await take(repo, { deviceId: "other-phone", submissionId: "x" }, NOW + 30_000)).status).toBe("recorded");
    expect((await take(repo, { submissionId: "later" }, NOW + REPEAT_WINDOW_MS + 5_000)).status).toBe("recorded");
  });

  it("the token resolves only its own campus", async () => {
    const { repo } = setup();
    const harbor = (await repo.getCampus("harbor"))!;
    const cedar = (await repo.getCampus("cedar"))!;
    expect(harbor.studentToken).not.toBe(cedar.studentToken);
    expect(harbor.studentToken).not.toContain("harbor");
    expect((await repo.getCampusByToken(harbor.studentToken))!.id).toBe("harbor");
    expect(await repo.getCampusByToken("harbor")).toBeNull(); // the plain campus id is not a token
    expect(await repo.getCampusByToken("")).toBeNull();
    // A product from another campus can't be taken through this campus.
    const cross = await repo.studentTakeout(
      { campusId: "harbor", deviceId: "d", submissionId: "z", lines: [{ productId: "cedar:c_corn", qty: 1 }] },
      TODAY,
    );
    expect(cross.status).toBe("empty");
  });
});

describe("PO.1 property: stock never goes negative, whatever happens", () => {
  it("holds for random staff removals, student take-outs and fixes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            kind: fc.constantFrom("staff", "student", "fix"),
            product: fc.constantFrom("harbor:rice", "harbor:beans", "harbor:pb", "harbor:tomato"),
            qty: fc.integer({ min: 1, max: 400 }),
          }),
          { maxLength: 15 },
        ),
        async (ops) => {
          const { repo } = setup();
          let group: string | null = null;
          for (const [i, op] of ops.entries()) {
            if (op.kind === "staff") {
              const r = await repo.recordOut(
                { campusId: "harbor", reason: "other", lines: [{ productId: op.product, qty: op.qty }], idempotencyKey: `k${i}` },
                TODAY,
              );
              group = r.groupId ?? group;
            } else if (op.kind === "student") {
              await repo.studentTakeout(
                { campusId: "harbor", deviceId: `d${i}`, submissionId: `s${i}`, lines: [{ productId: op.product, qty: op.qty }] },
                TODAY,
              );
            } else if (group) {
              await repo.fixEntry("harbor", group, [{ productId: op.product, qty: op.qty }], TODAY);
            }
          }
          for (const row of await repo.listInventory("harbor", TODAY)) {
            expect(row.onShelf).toBeGreaterThanOrEqual(0);
            expect(row.reserved).toBeLessThanOrEqual(Math.max(row.onShelf, 0));
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe("Count looks off", () => {
  it("'Use N' writes a recount ledger entry for the difference; 'Keep' changes nothing", async () => {
    const { repo } = setup();
    const [check] = await repo.listCountChecks("harbor", TODAY);
    expect(check).toMatchObject({ name: "Ramen noodles (chicken)", counted: 7, system: 9 });
    expect(await repo.resolveCountCheck("harbor", check.id, true, TODAY)).toBe(true);
    expect(await onShelf(repo, "harbor:ramen")).toBe(7);
    expect(await repo.listCountChecks("harbor", TODAY)).toEqual([]);

    const fresh = setup().repo;
    const [again] = await fresh.listCountChecks("harbor", TODAY);
    await fresh.resolveCountCheck("harbor", again.id, false, TODAY);
    expect(await onShelf(fresh, "harbor:ramen")).toBe(9);
    expect(await fresh.listCountChecks("harbor", TODAY)).toEqual([]);
  });
});
