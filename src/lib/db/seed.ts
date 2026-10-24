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
import { correctionKey } from "@/lib/corrections";
import type { Batch, Ledger } from "@/lib/stock";

export interface SeedProduct {
  id: string;
  campusId: string;
  productKey: string;
  name: string;
  brand: string | null;
  unit: string;
  category: string;
  noExpire: boolean;
  source: "donated" | "purchased";
}

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

// Community offers posted by the four non-live campuses (seen on Community but
// with no live inventory). Ported from data.js `offers` (invented).
export interface SeedOffer {
  id: string;
  campusId: string;
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
  { id: "o3", campusId: "cedar", name: "Applesauce pouches", unit: "pouch", qty: 40, category: "Fruit Cups/Pouches", expiresOffsetDays: 38 },
  { id: "o4", campusId: "cedar", name: "Shampoo, travel size", unit: "bottle", qty: 25, category: "Hygiene Items", expiresOffsetDays: null, noExpire: true },
  { id: "o5", campusId: "northfield", name: "Penne pasta", unit: "box", qty: 30, category: "Dried Pasta/Grains", expiresOffsetDays: null },
  { id: "o6", campusId: "riverside", name: "Snack bars", unit: "bar", qty: 120, category: "Granola Bar/Cracker Snacks", expiresOffsetDays: 129 },
  { id: "o7", campusId: "bayview", name: "Peanut butter", unit: "jar", qty: 12, category: "Sauces/Pastes/Spread", expiresOffsetDays: 100 },
  { id: "o8", campusId: "hillcrest", name: "Ramen cups", unit: "cup", qty: 60, category: "Microwave cup/package", expiresOffsetDays: null },
];

// Community requests from other campuses (invented, from data.js `requests`).
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

export interface SeededCampus {
  products: SeedProduct[];
  batches: Batch[];
  ledger: Ledger[];
}

/**
 * Turn item specs into products + batches + balancing ledger entries for a
 * campus, so derived on-shelf == qty and lastRestockAmount == of. `todayIso`
 * anchors the relative dates (PB.6).
 */
export function seedCampus(campusId: string, specs: SeedItemSpec[], todayIso: string): SeededCampus {
  const products: SeedProduct[] = [];
  const batches: Batch[] = [];
  const ledger: Ledger[] = [];

  for (const s of specs) {
    const productKey = correctionKey(s.name, s.brand);
    const productId = `${campusId}:${s.id}`;
    const receivedOn = isoFromOffset(todayIso, s.restockOffsetDays);
    const expiresOn = s.expiresOffsetDays === null ? null : isoFromOffset(todayIso, s.expiresOffsetDays);

    products.push({
      id: productId,
      campusId,
      productKey,
      name: s.name,
      brand: s.brand || null,
      unit: s.unit,
      category: s.category,
      noExpire: !!s.noExpire,
      source: s.source,
    });

    // One intake batch sized to the last restock amount (`of`).
    batches.push({
      id: `${productId}:b0`,
      productKey: productId, // scope batches/ledger to the product id
      quantity: s.of,
      receivedOn,
      createdAt: `${receivedOn}T10:00:00.000Z`,
      expiresOn,
    });

    // Balancing take-out so derived on-shelf == qty (of - qty already consumed).
    const consumed = s.of - s.qty;
    if (consumed > 0) {
      ledger.push({
        id: `${productId}:seedout`,
        productKey: productId,
        delta: -consumed,
        kind: "takeout",
        at: `${receivedOn}T12:00:00.000Z`,
        createdAt: `${receivedOn}T12:00:00.000Z`,
      });
    }
  }

  return { products, batches, ledger };
}
