import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { todayInTz } from "@/lib/dates";
import { AppService } from "./service";
import { MemoryStore } from "./store-memory";

const TODAY = todayInTz();

function setup() {
  return new AppService(new MemoryStore(TODAY));
}

const row = async (repo: AppService, campus: string, id: string) => (await repo.getProduct(campus, id, TODAY))!;
const cornAt = async (repo: AppService, campus: string) =>
  (await repo.listInventory(campus, TODAY)).find((r) => r.name === "Canned corn" && r.brand === "Valley Farms")!;

describe("PO.6a: offer → claim → pickup subtracts from the offering campus exactly once", () => {
  it("harbor offers, cedar claims and picks up", async () => {
    const repo = setup();
    const offered = await repo.createOffer({ campusId: "harbor", productId: "harbor:pb", qty: 40, note: null }, TODAY);
    expect((await row(repo, "harbor", "harbor:pb")).onShelf).toBe(150); // offer: no stock change
    expect((await row(repo, "harbor", "harbor:pb")).reserved).toBe(40);

    const claim = await repo.claimOffer("cedar", offered!.offerId, 30);
    expect(claim?.qty).toBe(30);
    // Still reserved (10 on the open offer + 30 on the pending pickup), still on the shelf.
    expect((await row(repo, "harbor", "harbor:pb")).onShelf).toBe(150);
    expect((await row(repo, "harbor", "harbor:pb")).reserved).toBe(40);

    const done = await repo.completePickup("cedar", claim!.pickupId, TODAY);
    expect(done).toMatchObject({ moved: 30, duplicate: false });
    expect((await row(repo, "harbor", "harbor:pb")).onShelf).toBe(120);
    expect((await row(repo, "harbor", "harbor:pb")).reserved).toBe(10); // pickup released
    const pbAtCedar = (await repo.listInventory("cedar", TODAY)).find((r) => r.name === "Peanut butter (single serve)")!;
    expect(pbAtCedar.onShelf).toBe(30);
    expect(pbAtCedar.brand).toBe("Sunrise"); // same product identity, brand carried over

    // Marking it picked up again changes nothing on either side.
    const again = await repo.completePickup("cedar", claim!.pickupId, TODAY);
    expect(again?.duplicate).toBe(true);
    expect((await row(repo, "harbor", "harbor:pb")).onShelf).toBe(120);
    expect((await repo.listInventory("cedar", TODAY)).find((r) => r.name === "Peanut butter (single serve)")!.onShelf).toBe(30);
  });

  it("a cedar offer backed by real stock lands on harbor's existing product", async () => {
    const repo = setup();
    const offer = (await repo.listCommunity("harbor", TODAY)).offers.find((o) => o.campusId === "cedar" && o.name === "Canned corn")!;
    expect((await cornAt(repo, "cedar")).reserved).toBe(20);
    const claim = await repo.claimOffer("harbor", offer.id, 12);
    const done = await repo.completePickup("harbor", claim!.pickupId, TODAY);
    expect(done).toMatchObject({ moved: 12, before: 5, after: 17 });
    expect((await row(repo, "harbor", "harbor:corn")).onShelf).toBe(17);
    const cedarCorn = await cornAt(repo, "cedar");
    expect(cedarCorn.onShelf).toBe(18); // 30 - 12
    expect(cedarCorn.reserved).toBe(8); // 20 offered - 12 picked up
  });

  it("a sample campus offer (no live inventory) only adds to the claimer", async () => {
    const repo = setup();
    const offer = (await repo.listCommunity("harbor", TODAY)).offers.find((o) => o.campusId === "hillcrest")!;
    const claim = await repo.claimOffer("harbor", offer.id, 10);
    const done = await repo.completePickup("harbor", claim!.pickupId, TODAY);
    expect(done?.moved).toBe(10);
    const ramenCups = (await repo.listInventory("harbor", TODAY)).find((r) => r.name === "Ramen cups")!;
    expect(ramenCups.onShelf).toBe(10);
  });

  it("only the claiming campus can mark it picked up; nobody can claim their own offer", async () => {
    const repo = setup();
    const offered = await repo.createOffer({ campusId: "harbor", productId: "harbor:rice", qty: 2, note: null }, TODAY);
    expect(await repo.claimOffer("harbor", offered!.offerId, 1)).toBeNull();
    const claim = await repo.claimOffer("cedar", offered!.offerId, 1);
    expect(await repo.completePickup("harbor", claim!.pickupId, TODAY)).toBeNull();
    expect((await row(repo, "harbor", "harbor:rice")).onShelf).toBe(4);
  });

  it("claims are capped at what is offered, and a fully claimed offer can't be claimed again", async () => {
    const repo = setup();
    const offered = await repo.createOffer({ campusId: "harbor", productId: "harbor:rice", qty: 3, note: null }, TODAY);
    expect((await repo.claimOffer("cedar", offered!.offerId, 50))?.qty).toBe(3);
    expect(await repo.claimOffer("cedar", offered!.offerId, 1)).toBeNull();
  });

  it("withdrawing an open offer releases the reservation with no stock change", async () => {
    const repo = setup();
    const offered = await repo.createOffer({ campusId: "harbor", productId: "harbor:rice", qty: 3, note: null }, TODAY);
    expect(await repo.withdrawOffer("harbor", offered!.offerId)).toBe(true);
    const r = await row(repo, "harbor", "harbor:rice");
    expect(r).toMatchObject({ onShelf: 4, reserved: 0 });
    expect(await repo.claimOffer("cedar", offered!.offerId, 1)).toBeNull();
  });

  it("requests: created with a normalized category; offering against one marks it answered", async () => {
    const repo = setup();
    const req = await repo.createRequest({ campusId: "harbor", name: "  Cereal cups ", category: "cereal", qty: 12 });
    const created = (await repo.listCommunity("harbor", TODAY)).requests.find((r) => r.id === req!.requestId)!;
    expect(created).toMatchObject({ name: "Cereal cups", category: "Cereal", qty: 12 });
    expect(await repo.createRequest({ campusId: "harbor", name: "", category: "Cereal", qty: 1 })).toBeNull();

    const bayview = (await repo.listCommunity("harbor", TODAY)).requests.find((r) => r.campusId === "bayview")!;
    await repo.createOffer({ campusId: "harbor", productId: "harbor:pb", qty: 30, note: null, requestId: bayview.id }, TODAY);
    expect((await repo.listCommunity("harbor", TODAY)).requests.find((r) => r.id === bayview.id)!.offered).toBe(30);
  });
});

describe("PO.6 property: a pickup conserves stock across the two campuses and never goes negative", () => {
  it("holds for random offer, claim and pickup amounts (with removals in between)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 160 }),
        fc.integer({ min: 1, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        async (offerQty, claimQty, removeQty) => {
          const repo = setup();
          const harborBefore = (await row(repo, "harbor", "harbor:pb")).onShelf;
          const offered = await repo.createOffer({ campusId: "harbor", productId: "harbor:pb", qty: offerQty, note: null }, TODAY);
          if (!offered) return;
          const claim = await repo.claimOffer("cedar", offered.offerId, claimQty);
          if (!claim) return;
          // Staff can only remove what isn't reserved.
          await repo.recordOut({ campusId: "harbor", reason: "other", lines: [{ productId: "harbor:pb", qty: removeQty || 1 }], idempotencyKey: null }, TODAY);
          const harborMid = (await row(repo, "harbor", "harbor:pb")).onShelf;
          const done = await repo.completePickup("cedar", claim.pickupId, TODAY);
          const harborAfter = (await row(repo, "harbor", "harbor:pb")).onShelf;
          const cedar = (await repo.listInventory("cedar", TODAY)).find((r) => r.name === "Peanut butter (single serve)");
          expect(done!.moved).toBe(claim.qty); // reserved units were protected from the removal
          expect(harborMid - harborAfter).toBe(done!.moved); // left A exactly once
          expect(cedar?.onShelf ?? 0).toBe(done!.moved); // arrived at B
          expect(harborAfter).toBeGreaterThanOrEqual(0);
          expect(harborBefore).toBeGreaterThanOrEqual(harborAfter);
        },
      ),
      { numRuns: 30 },
    );
  });
});
