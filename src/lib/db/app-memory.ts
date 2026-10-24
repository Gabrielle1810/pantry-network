// In-memory app read repository (Step 1). Seeds two live campuses (harbor full,
// cedar smaller) and derives inventory rows from batches + ledger. Used for
// local dev + tests. Per-process (resets per serverless instance) — the
// deployed demo uses Supabase (PM.2/UI13.8).
import { CAMPUSES, LIVE_CAMPUS_IDS } from "@/lib/campus";
import { categoryGroup } from "@/lib/items/taxonomy";
import { deriveOnShelf, lastRestockAmount, soonestExpiry, sortFIFO, type Batch, type Ledger } from "@/lib/stock";
import { statusOf } from "@/lib/status";
import { seedCampus, HARBOR_ITEMS, CEDAR_ITEMS, type SeedProduct } from "./seed";
import type { AppReadRepository, InventoryRow } from "./app-types";

interface CampusData {
  products: SeedProduct[];
  batches: Batch[];
  ledger: Ledger[];
  /** reserved units per productId from open offers (seed starts at 0). */
  reserved: Map<string, number>;
}

export class MemoryAppRepository implements AppReadRepository {
  readonly name = "memory" as const;
  private campuses = new Map<string, CampusData>();

  constructor(todayIso: string) {
    const harbor = seedCampus("harbor", HARBOR_ITEMS, todayIso);
    const cedar = seedCampus("cedar", CEDAR_ITEMS, todayIso);
    this.campuses.set("harbor", { ...harbor, reserved: new Map() });
    this.campuses.set("cedar", { ...cedar, reserved: new Map() });
  }

  async listCampuses() {
    return LIVE_CAMPUS_IDS.map((id) => {
      const c = CAMPUSES[id];
      return { id: c.id, name: c.name, region: c.region, miles: c.miles, live: c.live };
    });
  }

  private rowsFor(campusId: string, todayIso: string): InventoryRow[] {
    const data = this.campuses.get(campusId);
    if (!data) return [];
    return data.products.map((p) => {
      const batches = data.batches.filter((b) => b.productKey === p.id);
      const ledger = data.ledger.filter((l) => l.productKey === p.id);
      const onShelf = deriveOnShelf(batches, ledger);
      const lastRestock = lastRestockAmount(batches);
      const expiresOn = soonestExpiry(batches);
      const sorted = sortFIFO(batches);
      const lastRestockOn = sorted.length ? sorted[sorted.length - 1].receivedOn : null;
      const reserved = data.reserved.get(p.id) ?? 0;
      const status = statusOf(
        { onShelf, lastRestock, soonestDate: expiresOn, noExpire: p.noExpire },
        todayIso,
      );
      return {
        productId: p.id,
        campusId,
        productKey: p.productKey,
        name: p.name,
        brand: p.brand,
        unit: p.unit,
        category: p.category,
        categoryGroup: categoryGroup(p.category),
        source: p.source,
        noExpire: p.noExpire,
        onShelf,
        reserved,
        lastRestock,
        lastRestockOn,
        expiresOn,
        status,
      };
    });
  }

  async listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return this.rowsFor(campusId, todayIso).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    // In stock minus reserved, not expired (PI.2).
    return this.rowsFor(campusId, todayIso)
      .filter((r) => r.onShelf - r.reserved > 0 && r.status !== "expired")
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

let memoryAppSingleton: MemoryAppRepository | null = null;
let seededForDay: string | null = null;

/** Process-level singleton, re-seeded if the day rolls over (relative dates). */
export function getMemoryAppRepository(todayIso: string): MemoryAppRepository {
  if (!memoryAppSingleton || seededForDay !== todayIso) {
    memoryAppSingleton = new MemoryAppRepository(todayIso);
    seededForDay = todayIso;
  }
  return memoryAppSingleton;
}
