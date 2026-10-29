import { describe, expect, it } from "vitest";
import type { InventoryRow } from "@/lib/db/app-types";
import type { OfferRec, PickupRec, RequestRec } from "@/lib/db/store";
import type { Status } from "@/lib/status";
import {
  availableOffers,
  clampAmount,
  matchChip,
  matchRequest,
  myOffers,
  pickupViews,
  recommendations,
  requestViews,
} from "./index";

const TODAY = "2026-10-24";

function row(over: Partial<InventoryRow> & { name: string; status: Status }): InventoryRow {
  return {
    productId: `harbor:${over.name}`,
    campusId: "harbor",
    productKey: over.name.toLowerCase(),
    brand: null,
    unit: "can",
    category: "Canned Goods",
    categoryGroup: "Meal Essentials",
    source: "donated",
    noExpire: false,
    onShelf: 10,
    reserved: 0,
    lastRestock: 20,
    lastRestockOn: TODAY,
    expiresOn: null,
    ...over,
  };
}

function offer(over: Partial<OfferRec>): OfferRec {
  return {
    id: Math.random().toString(36).slice(2),
    campusId: "riverside",
    productId: null,
    name: "Canned corn",
    unit: "can",
    qty: 48,
    category: "Canned Goods",
    expiresOn: "2026-12-01",
    noExpire: false,
    status: "open",
    note: null,
    createdAt: "2026-10-24T10:00:00.000Z",
    ...over,
  };
}

describe("matchChip", () => {
  it("leads with your own need: out, then running low", () => {
    const o = offer({});
    expect(matchChip(o, "harbor", [row({ name: "Beans", status: "out" })], [o]).text).toBe("You're out of this");
    expect(matchChip(o, "harbor", [row({ name: "Beans", status: "low" })], [o]).text).toBe("You're running low");
  });
  it("then facts: doesn't expire, closest, same pickup, big batch, lasts until, shelf stable", () => {
    expect(matchChip(offer({ noExpire: true, category: "Hygiene Items" }), "harbor", [], []).text).toBe("Doesn't expire");
    expect(matchChip(offer({ campusId: "cedar" }), "harbor", [], []).text).toBe("Closest to you");
    const a = offer({ id: "a", name: "Snack bars", qty: 30 });
    const b = offer({ id: "b", name: "Canned corn", qty: 48 });
    expect(matchChip(a, "harbor", [], [a, b]).text).toBe("Same pickup as the canned corn");
    expect(matchChip(offer({ qty: 120 }), "harbor", [], []).text).toBe("Big batch · 120 cans");
    expect(matchChip(offer({}), "harbor", [], []).text).toBe("Lasts until December");
    expect(matchChip(offer({ expiresOn: null }), "harbor", [], []).text).toBe("Shelf stable");
  });
});

describe("availableOffers", () => {
  const offers = [
    offer({ id: "own", campusId: "harbor" }),
    offer({ id: "far", campusId: "hillcrest", category: "Cereal" }),
    offer({ id: "near", campusId: "cedar" }),
    offer({ id: "gone", campusId: "cedar", status: "withdrawn" }),
    offer({ id: "empty", campusId: "cedar", qty: 0 }),
  ];
  it("excludes your own, closed and empty offers; your needs first, then distance", () => {
    const list = availableOffers({ activeCampus: "harbor", rows: [row({ name: "Corn", status: "out" })], offers });
    expect(list.map((v) => v.offer.id)).toEqual(["near", "far"]);
  });
  it("filters by distance and category group", () => {
    expect(availableOffers({ activeCampus: "harbor", rows: [], offers, region: "10" }).map((v) => v.offer.id)).toEqual(["near"]);
    expect(availableOffers({ activeCampus: "harbor", rows: [], offers, group: "Meal Essentials" }).length).toBe(2);
  });
});

describe("matchRequest", () => {
  const rows = [
    row({ name: "Peanut butter (single serve)", category: "Sauces/Pastes/Spread", status: "good", onShelf: 150 }),
    row({ name: "Canned corn", category: "Canned Goods", status: "good", onShelf: 5 }),
    row({ name: "Expired soup", category: "Canned Goods", status: "expired", onShelf: 9 }),
    row({ name: "Toothpaste", category: "Hygiene Items", status: "good", onShelf: 8, reserved: 8 }),
  ];
  it("prefers a name match in the same category, skips expired and fully reserved", () => {
    expect(matchRequest({ name: "Peanut butter packets", category: "Sauces/Pastes/Spread" }, rows)?.name).toBe("Peanut butter (single serve)");
    expect(matchRequest({ name: "Canned vegetables", category: "Canned Goods" }, rows)?.name).toBe("Canned corn");
    expect(matchRequest({ name: "Toothpaste", category: "Hygiene Items" }, rows)).toBeNull();
  });
});

describe("recommendations", () => {
  it("builds claim / offer / need cards and respects 'Not now'", () => {
    const rows = [
      row({ name: "Cheerios", category: "Cereal", status: "out", onShelf: 0 }),
      row({ name: "Tomato paste", category: "Sauces/Pastes/Spread", status: "soon", expiresOn: "2026-10-26", onShelf: 2 }),
    ];
    const offers = [offer({ id: "cereal", campusId: "northfield", name: "Cereal cups", category: "Cereal", qty: 24 })];
    const requests: RequestRec[] = [
      { id: "r", campusId: "bayview", name: "Tomato sauce", category: "Sauces/Pastes/Spread", qty: 10, offered: null, createdAt: TODAY },
    ];
    const recs = recommendations({ activeCampus: "harbor", rows, offers, requests, todayIso: TODAY });
    expect(recs.map((r) => r.key)).toEqual(["claim", "offer", "need"]);
    expect(recs[0].title).toBe("Northfield College is offering 24 cereal cups");
    expect(recs[1].title).toBe("Your tomato paste expires in 2 days");
    expect(recs[2].title).toBe("Bayview Community College needs 10 tomato sauce");
    const quiet = recommendations({ activeCampus: "harbor", rows, offers, requests, todayIso: TODAY, dismissed: new Set(["offer"]) });
    expect(quiet.map((r) => r.key)).toEqual(["claim", "need"]);
  });
});

describe("views", () => {
  const pickups: PickupRec[] = [
    { id: "p1", offerId: "o1", productId: null, fromCampus: "cedar", toCampus: "harbor", name: "Canned corn", unit: "can", qty: 12, category: "Canned Goods", expiresOn: null, noExpire: false, status: "pending", createdAt: TODAY },
    { id: "p2", offerId: "o2", productId: "harbor:pb", fromCampus: "harbor", toCampus: "cedar", name: "Peanut butter", unit: "packet", qty: 30, category: "x", expiresOn: null, noExpire: false, status: "pending", createdAt: TODAY },
  ];
  it("pickups split into incoming (you mark them picked up) and outgoing", () => {
    const v = pickupViews("harbor", pickups);
    expect(v.map((x) => [x.direction, x.text])).toEqual([
      ["incoming", "12 cans of canned corn from Cedar Hill College"],
      ["outgoing", "Cedar Hill College is picking up 30 packets of peanut butter"],
    ]);
  });
  it("your offers show who claimed them", () => {
    const mine = myOffers("harbor", [offer({ id: "o2", campusId: "harbor", qty: 0, status: "claimed" })], pickups);
    expect(mine[0]).toMatchObject({ status: "claimed", chip: "Claimed by Cedar Hill College" });
  });
  it("requests put yours first", () => {
    const reqs: RequestRec[] = [
      { id: "a", campusId: "bayview", name: "Rice", category: "Dried Pasta/Grains", qty: 5, offered: null, createdAt: "2026-10-24T01:00:00Z" },
      { id: "b", campusId: "harbor", name: "Cereal", category: "Cereal", qty: 5, offered: null, createdAt: "2026-10-23T01:00:00Z" },
    ];
    expect(requestViews("harbor", reqs, []).map((v) => [v.request.id, v.mine])).toEqual([["b", true], ["a", false]]);
  });
  it("clampAmount keeps 1..max", () => {
    expect(clampAmount(0, 5)).toBe(1);
    expect(clampAmount(99, 5)).toBe(5);
    expect(clampAmount(3, 0)).toBe(0);
  });
});
