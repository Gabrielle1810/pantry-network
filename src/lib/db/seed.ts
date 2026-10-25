// Seed data for the two live campuses (decision #1/#2). Ported from
// design-reference/app/data.js (all invented). Each item becomes:
//   * a product (identity by normalized name|brand),
//   * one intake batch sized to its "last restock amount" (`of`), so
//     lastRestockAmount == of, and
//   * a balancing take-out ledger entry of (of - qty), so derived on-shelf == qty.
// This makes the Inventory numbers match the prototype on first load while using
// the real batches+ledger model.
//
// Dates are SEEDED RELATIVE TO TODAY (PB.6) so "expires in 2 days" still holds on
// demo day. Each item carries a `expiresOffsetDays` (days from today, or null)
// and `restockOffsetDays` (negative = in the past) instead of fixed dates.
//
// The plan (buildSeedPlan) is store-agnostic: the in-memory store and the
// Supabase seed both load the same plan, so local dev and the live demo match.
// Demo feed entries ("Out today") are seeded as ledger rows in groups; an older
// batch of equal size keeps each product's derived on-shelf equal to its qty.
import { correctionKey } from "@/lib/corrections";
import { categoryGroup } from "@/lib/items/taxonomy";
import { startOfDayMs } from "@/lib/dates";
import type { LedgerKind } from "@/lib/stock";
import type { LedgerSource, NewProduct } from "./store";

export interface SeedItemSpec {
  id: string;
  name: string;
  brand: string;
  unit: string;
  category: string;
  qty: number; // on-shelf now
  of: number; // last restock amount
  expiresOffsetDays: number | null; // from today; null = no date
  restockOffsetDays: number; // negative = past
  source: "donated" | "purchased";
  noExpire?: boolean;
}

// Harbor = full data.js inventory. Offsets chosen so the prototype's relative
// story holds: tomato paste expiring "in 2 days", several expired, etc.
// (data.js TODAY was 2026-10-24; offset = date - that TODAY, in days.)
export const HARBOR_ITEMS: SeedItemSpec[] = [
  { id: "vinegar", name: "White distilled vinegar", brand: "Wegmans", unit: "bottle", category: "Oils/Vinegar", qty: 2, of: 2, expiresOffsetDays: null, restockOffsetDays: -135, source: "purchased" },
  { id: "cookiemix", name: "Chocolate chip cookie mix", brand: "Betty Crocker", unit: "bag", category: "Baking", qty: 1, of: 1, expiresOffsetDays: -127, restockOffsetDays: -135, source: "donated" },
  { id: "chickarina", name: "Chickarina soup", brand: "Progresso", unit: "can", category: "Canned Goods", qty: 1, of: 1, expiresOffsetDays: -28, restockOffsetDays: -135, source: "donated" },
  { id: "tomato", name: "Tomato paste", brand: "Hunt's", unit: "can", category: "Sauces/Pastes/Spread", qty: 2, of: 4, expiresOffsetDays: 2, restockOffsetDays: -135, source: "purchased" },
  { id: "rice", name: "Jasmine rice", brand: "So Natural", unit: "bag", category: "Dried Pasta/Grains", qty: 4, of: 6, expiresOffsetDays: null, restockOffsetDays: -117, source: "purchased" },
  { id: "pbmilk", name: "Plant based milk", brand: "Ripple", unit: "bottle", category: "Drinks/Juice/Milk/Protein", qty: 3, of: 12, expiresOffsetDays: null, restockOffsetDays: -117, source: "donated" },
  { id: "ramen", name: "Ramen noodles (chicken)", brand: "Maruchan", unit: "cup", category: "Microwave cup/package", qty: 9, of: 12, expiresOffsetDays: null, restockOffsetDays: -117, source: "purchased" },
  { id: "soymilk", name: "Soy milk", brand: "Silk", unit: "bottle", category: "Drinks/Juice/Milk/Protein", qty: 5, of: 12, expiresOffsetDays: 23, restockOffsetDays: -144, source: "donated" },
  { id: "applesauce", name: "Applesauce pouches", brand: "Mott's", unit: "pouch", category: "Fruit Cups/Pouches", qty: 20, of: 32, expiresOffsetDays: 35, restockOffsetDays: -144, source: "donated" },
  { id: "beans", name: "Black beans", brand: "Goya", unit: "can", category: "Canned Goods", qty: 3, of: 16, expiresOffsetDays: null, restockOffsetDays: -144, source: "purchased" },
  { id: "pb", name: "Peanut butter (single serve)", brand: "Jif", unit: "packet", category: "Sauces/Pastes/Spread", qty: 150, of: 200, expiresOffsetDays: 55, restockOffsetDays: -144, source: "donated" },
  { id: "cheerios", name: "Cereal (Cheerios)", brand: "General Mills", unit: "cup", category: "Cereal", qty: 0, of: 12, expiresOffsetDays: null, restockOffsetDays: -144, source: "donated" },
  { id: "penne", name: "Penne pasta", brand: "Barilla", unit: "box", category: "Dried Pasta/Grains", qty: 10, of: 24, expiresOffsetDays: null, restockOffsetDays: -131, source: "purchased" },
  { id: "granola", name: "Granola bars", brand: "Nature Valley", unit: "bar", category: "Granola Bar/Cracker Snacks", qty: 18, of: 40, expiresOffsetDays: 129, restockOffsetDays: -131, source: "donated" },
  { id: "corn", name: "Canned corn", brand: "Del Monte", unit: "can", category: "Canned Goods", qty: 5, of: 24, expiresOffsetDays: 189, restockOffsetDays: -131, source: "purchased" },
  { id: "macncheese", name: "Mac and cheese cups", brand: "Kraft", unit: "cup", category: "Microwave cup/package", qty: 14, of: 24, expiresOffsetDays: 9, restockOffsetDays: -126, source: "donated" },
  { id: "tuna", name: "Tuna", brand: "StarKist", unit: "can", category: "Dried/Canned Meats/Protein", qty: 7, of: 20, expiresOffsetDays: null, restockOffsetDays: -126, source: "purchased" },
  { id: "oatmeal", name: "Oatmeal packets", brand: "Quaker", unit: "packet", category: "Cereal", qty: 25, of: 50, expiresOffsetDays: 78, restockOffsetDays: -126, source: "donated" },
  { id: "sauce", name: "Spaghetti sauce", brand: "Prego", unit: "jar", category: "Sauces/Pastes/Spread", qty: 5, of: 8, expiresOffsetDays: -55, restockOffsetDays: -138, source: "purchased" },
  { id: "peaches", name: "Peach fruit cups", brand: "Dole", unit: "cup", category: "Fruit Cups/Pouches", qty: 12, of: 24, expiresOffsetDays: -101, restockOffsetDays: -138, source: "donated" },
  { id: "chickensoup", name: "Chicken noodle soup", brand: "Campbell's", unit: "can", category: "Canned Goods", qty: 4, of: 12, expiresOffsetDays: -23, restockOffsetDays: -138, source: "donated" },
  { id: "juice", name: "Apple juice boxes", brand: "Juicy Juice", unit: "box", category: "Drinks/Juice/Milk/Protein", qty: 2, of: 10, expiresOffsetDays: -12, restockOffsetDays: -138, source: "donated" },
  { id: "flour", name: "All-purpose flour", brand: "King Arthur", unit: "bag", category: "Baking", qty: 2, of: 3, expiresOffsetDays: 119, restockOffsetDays: -135, source: "purchased" },
  { id: "cinnamon", name: "Ground cinnamon", brand: "McCormick", unit: "jar", category: "Spices", qty: 1, of: 2, expiresOffsetDays: null, restockOffsetDays: -135, source: "donated" },
  { id: "oil", name: "Olive oil", brand: "Bertolli", unit: "bottle", category: "Oils/Vinegar", qty: 3, of: 4, expiresOffsetDays: 281, restockOffsetDays: -135, source: "purchased" },
  { id: "toothpaste", name: "Toothpaste", brand: "Colgate", unit: "tube", category: "Hygiene Items", qty: 8, of: 10, expiresOffsetDays: null, restockOffsetDays: -117, source: "donated", noExpire: true },
  { id: "shampoo", name: "Shampoo, travel size", brand: "Suave", unit: "bottle", category: "Hygiene Items", qty: 2, of: 12, expiresOffsetDays: null, restockOffsetDays: -117, source: "donated", noExpire: true },
  { id: "crackers", name: "Peanut butter crackers", brand: "Lance", unit: "pack", category: "Granola Bar/Cracker Snacks", qty: 16, of: 24, expiresOffsetDays: 8, restockOffsetDays: -117, source: "purchased" },
];

// Cedar = smaller invented partner inventory (~11 items).
export const CEDAR_ITEMS: SeedItemSpec[] = [
  { id: "c_corn", name: "Canned corn", brand: "Del Monte", unit: "can", category: "Canned Goods", qty: 30, of: 48, expiresOffsetDays: 15, restockOffsetDays: -20, source: "donated" },
  { id: "c_cereal", name: "Cereal cups", brand: "Kellogg's", unit: "cup", category: "Cereal", qty: 18, of: 24, expiresOffsetDays: 83, restockOffsetDays: -20, source: "donated" },
  { id: "c_rice", name: "White rice", brand: "Carolina", unit: "bag", category: "Dried Pasta/Grains", qty: 6, of: 12, expiresOffsetDays: null, restockOffsetDays: -30, source: "purchased" },
  { id: "c_beans", name: "Pinto beans", brand: "Bush's", unit: "can", category: "Canned Goods", qty: 2, of: 20, expiresOffsetDays: 210, restockOffsetDays: -30, source: "purchased" },
  { id: "c_pasta", name: "Spaghetti", brand: "Barilla", unit: "box", category: "Dried Pasta/Grains", qty: 9, of: 16, expiresOffsetDays: null, restockOffsetDays: -25, source: "donated" },
  { id: "c_soup", name: "Tomato soup", brand: "Campbell's", unit: "can", category: "Canned Goods", qty: 1, of: 12, expiresOffsetDays: 5, restockOffsetDays: -25, source: "donated" },
  { id: "c_oats", name: "Oatmeal packets", brand: "Quaker", unit: "packet", category: "Cereal", qty: 40, of: 50, expiresOffsetDays: 120, restockOffsetDays: -18, source: "donated" },
  { id: "c_pb", name: "Peanut butter", brand: "Skippy", unit: "jar", category: "Sauces/Pastes/Spread", qty: 4, of: 12, expiresOffsetDays: 160, restockOffsetDays: -18, source: "donated" },
  { id: "c_soap", name: "Bar soap", brand: "Dove", unit: "pack", category: "Hygiene Items", qty: 7, of: 20, expiresOffsetDays: null, restockOffsetDays: -18, source: "donated", noExpire: true },
  { id: "c_juice", name: "Orange juice boxes", brand: "Minute Maid", unit: "box", category: "Drinks/Juice/Milk/Protein", qty: 3, of: 18, expiresOffsetDays: -5, restockOffsetDays: -22, source: "donated" },
  { id: "c_granola", name: "Granola bars", brand: "Kind", unit: "bar", category: "Granola Bar/Cracker Snacks", qty: 22, of: 40, expiresOffsetDays: 95, restockOffsetDays: -22, source: "purchased" },
];

export function isoFromOffset(todayIso: string, offsetDays: number): string {
  const ms = Date.parse(`${todayIso}T00:00:00Z`) + offsetDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Demo "Out today" feed for harbor (ported from data.js, with NO names). Staff
// reasons are stable codes. `minutesAgo` is relative to when the seed runs.
// ---------------------------------------------------------------------------
export interface SeedFeedEntry {
  id: string;
  minutesAgo: number;
  source: "student" | "staff";
  reason?: "expired" | "damaged" | "given_out";
  lines: { ref: string; qty: number }[];
}

export const HARBOR_FEED: SeedFeedEntry[] = [
  { id: "f1", minutesAgo: 2, source: "student", lines: [{ ref: "beans", qty: 2 }, { ref: "ramen", qty: 1 }] },
  { id: "f2", minutesAgo: 10, source: "staff", reason: "expired", lines: [{ ref: "cookiemix", qty: 1 }, { ref: "chickarina", qty: 1 }] },
  { id: "f3", minutesAgo: 14, source: "student", lines: [{ ref: "rice", qty: 1 }] },
  { id: "f4", minutesAgo: 25, source: "staff", reason: "given_out", lines: [{ ref: "beans", qty: 2 }] },
  { id: "f5", minutesAgo: 41, source: "student", lines: [{ ref: "pb", qty: 3 }, { ref: "applesauce", qty: 2 }] },
  { id: "f6", minutesAgo: 60, source: "student", lines: [{ ref: "ramen", qty: 2 }, { ref: "soymilk", qty: 1 }, { ref: "granola", qty: 2 }] },
  { id: "f7", minutesAgo: 64, source: "student", lines: [{ ref: "beans", qty: 3 }] },
  { id: "f8", minutesAgo: 95, source: "student", lines: [{ ref: "ramen", qty: 4 }, { ref: "crackers", qty: 2 }] },
  { id: "f9", minutesAgo: 130, source: "student", lines: [{ ref: "macncheese", qty: 2 }, { ref: "ramen", qty: 3 }] },
  { id: "f10", minutesAgo: 180, source: "staff", reason: "damaged", lines: [{ ref: "oatmeal", qty: 2 }] },
  { id: "f11", minutesAgo: 240, source: "student", lines: [{ ref: "ramen", qty: 2 }, { ref: "pbmilk", qty: 1 }] },
];

// ---------------------------------------------------------------------------
// Community: offers from the four sample campuses, plus two cedar offers that
// are backed by real cedar inventory (so a pickup really moves stock). Requests
// from other campuses. All invented.
// ---------------------------------------------------------------------------
export interface SeedOffer {
  id: string;
  campusId: string;
  /** Seed item ref of a live campus's product that backs (reserves for) this offer. */
  productRef?: string;
  name: string;
  unit: string;
  qty: number;
  category: string;
  expiresOffsetDays: number | null;
  noExpire?: boolean;
}

export const SEED_OFFERS: SeedOffer[] = [
  { id: "o1", campusId: "riverside", name: "Canned corn", unit: "can", qty: 48, category: "Canned Goods", expiresOffsetDays: 15 },
  { id: "o2", campusId: "northfield", name: "Cereal cups", unit: "cup", qty: 24, category: "Cereal", expiresOffsetDays: 83 },
  { id: "o3", campusId: "cedar", productRef: "c_corn", name: "Canned corn", unit: "can", qty: 20, category: "Canned Goods", expiresOffsetDays: 15 },
  { id: "o4", campusId: "cedar", productRef: "c_soap", name: "Bar soap", unit: "pack", qty: 5, category: "Hygiene Items", expiresOffsetDays: null, noExpire: true },
  { id: "o5", campusId: "northfield", name: "Penne pasta", unit: "box", qty: 30, category: "Dried Pasta/Grains", expiresOffsetDays: null },
  { id: "o6", campusId: "riverside", name: "Snack bars", unit: "bar", qty: 120, category: "Granola Bar/Cracker Snacks", expiresOffsetDays: 129 },
  { id: "o7", campusId: "bayview", name: "Peanut butter", unit: "jar", qty: 12, category: "Sauces/Pastes/Spread", expiresOffsetDays: 100 },
  { id: "o8", campusId: "hillcrest", name: "Ramen cups", unit: "cup", qty: 60, category: "Microwave cup/package", expiresOffsetDays: null },
];

export interface SeedRequest {
  id: string;
  campusId: string;
  name: string;
  category: string;
  qty: number;
}

export const SEED_REQUESTS: SeedRequest[] = [
  { id: "r1", campusId: "bayview", name: "Peanut butter packets", category: "Sauces/Pastes/Spread", qty: 30 },
  { id: "r2", campusId: "riverside", name: "Canned vegetables", category: "Canned Goods", qty: 20 },
  { id: "r3", campusId: "cedar", name: "Toothpaste", category: "Hygiene Items", qty: 15 },
];

/** A sample "Count looks off": staff counted fewer than the system says. */
export const SEED_COUNT_CHECKS = [{ id: "cc1", campusId: "harbor", ref: "ramen", counted: 7 }];

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------
export interface PlanBatch {
  key: string;
  quantity: number;
  receivedOn: string;
  expiresOn: string | null;
  createdAt: string;
}
export interface PlanLedger {
  key: string;
  delta: number;
  kind: LedgerKind;
  source: LedgerSource;
  reason: string | null;
  groupKey: string | null;
  createdAt: string;
}
export interface PlanItem {
  ref: string;
  product: NewProduct;
  batches: PlanBatch[];
  ledger: PlanLedger[];
}
export interface PlanOffer {
  id: string;
  campusId: string;
  productRef: string | null;
  name: string;
  unit: string;
  qty: number;
  category: string;
  expiresOn: string | null;
  noExpire: boolean;
}
export interface SeedPlan {
  campuses: { campusId: string; items: PlanItem[] }[];
  offers: PlanOffer[];
  requests: SeedRequest[];
  counts: { id: string; campusId: string; ref: string; counted: number }[];
}

/** A stable uuid-shaped id from a string (not secret; for seed rows only). */
export function stableUuid(key: string): string {
  let h = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < key.length; j++) {
      h ^= key.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes.push(h & 0xff);
  }
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function planCampus(
  campusId: string,
  specs: SeedItemSpec[],
  feed: SeedFeedEntry[],
  todayIso: string,
  nowMs: number,
  dayStart: number,
): PlanItem[] {
  // Per-product total of feed outflow, so an equal older batch keeps on-shelf == qty.
  const fed = new Map<string, number>();
  for (const e of feed) for (const l of e.lines) fed.set(l.ref, (fed.get(l.ref) ?? 0) + l.qty);

  return specs.map((s) => {
    const receivedOn = isoFromOffset(todayIso, s.restockOffsetDays);
    const expiresOn = s.expiresOffsetDays === null ? null : isoFromOffset(todayIso, s.expiresOffsetDays);
    const group = categoryGroup(s.category);
    const product: NewProduct = {
      campusId,
      productKey: correctionKey(s.name, s.brand),
      name: s.name,
      brand: s.brand || null,
      sizeText: null,
      category: s.category,
      categoryGroup: group,
      unit: s.unit,
      noExpire: !!s.noExpire,
      source: s.source,
    };

    const batches: PlanBatch[] = [
      { key: `seed:${campusId}:${s.id}:b0`, quantity: s.of, receivedOn, expiresOn, createdAt: `${receivedOn}T10:00:00.000Z` },
    ];
    const earlier = fed.get(s.id) ?? 0;
    if (earlier > 0) {
      const olderOn = isoFromOffset(todayIso, s.restockOffsetDays - 14);
      batches.push({ key: `seed:${campusId}:${s.id}:b-1`, quantity: earlier, receivedOn: olderOn, expiresOn, createdAt: `${olderOn}T10:00:00.000Z` });
    }

    const ledger: PlanLedger[] = [];
    const consumed = s.of - s.qty;
    if (consumed > 0) {
      ledger.push({
        key: `seed:${campusId}:${s.id}:out`,
        delta: -consumed,
        kind: "takeout",
        source: "system",
        reason: "Seed baseline",
        groupKey: null,
        createdAt: `${receivedOn}T12:00:00.000Z`,
      });
    }
    for (const [i, e] of feed.entries()) {
      const line = e.lines.find((l) => l.ref === s.id);
      if (!line) continue;
      const natural = nowMs - e.minutesAgo * 60_000;
      const clamped = Math.min(nowMs, Math.max(natural, dayStart + 60_000 + (300 - Math.min(e.minutesAgo, 299)) * 1_000 + i));
      ledger.push({
        key: `seed:${campusId}:feed:${e.id}:${s.id}`,
        delta: -line.qty,
        kind: e.source === "student" ? "takeout" : "removal",
        source: e.source,
        reason: e.reason ?? null,
        groupKey: `feed:${campusId}:${e.id}`,
        createdAt: new Date(clamped).toISOString(),
      });
    }
    return { ref: s.id, product, batches, ledger };
  });
}

/** Everything the demo needs, with dates relative to `todayIso` / `nowMs`. */
export function buildSeedPlan(
  todayIso: string,
  nowMs: number = Date.now(),
  tz: string = process.env.CAMPUS_TZ ?? "America/New_York",
): SeedPlan {
  const dayStart = startOfDayMs(tz, nowMs);
  const offerSpecs = [...HARBOR_ITEMS.map((s) => ({ campus: "harbor", s })), ...CEDAR_ITEMS.map((s) => ({ campus: "cedar", s }))];
  return {
    campuses: [
      { campusId: "harbor", items: planCampus("harbor", HARBOR_ITEMS, HARBOR_FEED, todayIso, nowMs, dayStart) },
      { campusId: "cedar", items: planCampus("cedar", CEDAR_ITEMS, [], todayIso, nowMs, dayStart) },
    ],
    offers: SEED_OFFERS.map((o) => {
      const backing = o.productRef ? offerSpecs.find((x) => x.campus === o.campusId && x.s.id === o.productRef)?.s : undefined;
      return {
        id: o.id,
        campusId: o.campusId,
        productRef: backing ? o.productRef! : null,
        name: o.name,
        unit: o.unit,
        qty: o.qty,
        category: o.category,
        expiresOn: o.expiresOffsetDays === null ? null : isoFromOffset(todayIso, o.expiresOffsetDays),
        noExpire: !!o.noExpire,
      };
    }),
    requests: SEED_REQUESTS,
    counts: SEED_COUNT_CHECKS,
  };
}
