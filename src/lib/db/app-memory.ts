// In-memory app repository. Seeds two live campuses (harbor full, cedar
// smaller), derives inventory from batches + ledger, and accepts intake saves
// the same way the Supabase repo does. Used for local dev + tests. Per-process:
// it resets per serverless instance, so the deployed demo uses Supabase.
import { randomUUID } from "node:crypto";
import { CAMPUSES, LIVE_CAMPUS_IDS } from "@/lib/campus";
import { categoryGroup } from "@/lib/items/taxonomy";
import { correctionKey, type ProductCorrection } from "@/lib/corrections";
import {
  activeSoonestExpiry,
  deriveOnShelf,
  lastRestockAmount,
  sortFIFO,
  type Batch,
  type Ledger,
} from "@/lib/stock";
import { statusOf } from "@/lib/status";
import { seedCampus, HARBOR_ITEMS, CEDAR_ITEMS, type SeedProduct } from "./seed";
import type { AppRepository, IntakeInput, IntakeResult, InventoryRow } from "./app-types";

interface CampusData {
  products: SeedProduct[];
  batches: Batch[];
  ledger: Ledger[];
  /** reserved units per productId from open offers. */
  reserved: Map<string, number>;
}

export class MemoryAppRepository implements AppRepository {
  readonly name = "memory" as const;
  private campuses = new Map<string, CampusData>();
  private idempotency = new Map<string, string>(); // campus|key → batch id
  private corrections = new Map<string, ProductCorrection>(); // campus|key → fix

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

  private stockOf(data: CampusData, productId: string) {
    const batches = data.batches.filter((b) => b.productKey === productId);
    const ledger = data.ledger.filter((l) => l.productKey === productId);
    return { batches, ledger, onShelf: deriveOnShelf(batches, ledger) };
  }

  private toRow(data: CampusData, campusId: string, p: SeedProduct, todayIso: string): InventoryRow {
    const { batches, ledger, onShelf } = this.stockOf(data, p.id);
    const lastRestock = lastRestockAmount(batches);
    const expiresOn = activeSoonestExpiry(batches, ledger);
    const sorted = sortFIFO(batches);
    return {
      productId: p.id,
      campusId,
      productKey: p.productKey,
      name: p.name,
      brand: p.brand,
      unit: p.unit,
      category: p.category,
      categoryGroup: p.categoryGroup ?? categoryGroup(p.category),
      source: p.source,
      noExpire: p.noExpire,
      onShelf,
      reserved: data.reserved.get(p.id) ?? 0,
      lastRestock,
      lastRestockOn: sorted.length ? sorted[sorted.length - 1].receivedOn : null,
      expiresOn,
      status: statusOf({ onShelf, lastRestock, soonestDate: expiresOn, noExpire: p.noExpire }, todayIso),
    };
  }

  private rowsFor(campusId: string, todayIso: string): InventoryRow[] {
    const data = this.campuses.get(campusId);
    if (!data) return [];
    return data.products.map((p) => this.toRow(data, campusId, p, todayIso));
  }

  async listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return this.rowsFor(campusId, todayIso).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return this.rowsFor(campusId, todayIso)
      .filter((r) => r.onShelf - r.reserved > 0 && r.status !== "expired")
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProduct(campusId: string, productId: string, todayIso: string): Promise<InventoryRow | null> {
    const data = this.campuses.get(campusId);
    const p = data?.products.find((x) => x.id === productId);
    return data && p ? this.toRow(data, campusId, p, todayIso) : null;
  }

  async saveIntake(input: IntakeInput): Promise<IntakeResult> {
    const data = this.campuses.get(input.campusId);
    if (!data) throw new Error(`unknown campus: ${input.campusId}`);

    // Idempotent replay: the key was already used → return what it saved.
    const idemKey = input.idempotencyKey ? `${input.campusId}|${input.idempotencyKey}` : null;
    const existingBatchId = idemKey ? this.idempotency.get(idemKey) : undefined;
    if (existingBatchId) {
      const batch = data.batches.find((b) => b.id === existingBatchId)!;
      const product = data.products.find((p) => p.id === batch.productKey)!;
      const { onShelf } = this.stockOf(data, product.id);
      return {
        product: { id: product.id, name: product.name, brand: product.brand, unit: product.unit, category: product.category },
        batch: { id: batch.id, quantity: batch.quantity, receivedOn: batch.receivedOn, expiresOn: batch.expiresOn },
        duplicate: true,
        totals: { before: Math.max(0, onShelf - batch.quantity), added: batch.quantity, after: onShelf, firstBatch: false },
      };
    }

    // Create or reuse the product by product_key.
    const productKey = correctionKey(input.product.name, input.product.brand);
    let product = data.products.find((p) => p.productKey === productKey);
    if (!product) {
      product = {
        id: `${input.campusId}:${randomUUID()}`,
        campusId: input.campusId,
        productKey,
        name: input.product.name,
        brand: input.product.brand,
        unit: input.product.unit,
        category: input.product.category,
        categoryGroup: input.product.categoryGroup,
        sizeText: input.product.sizeText,
        noExpire: input.product.noExpire,
        source: input.product.source ?? "donated",
      };
      data.products.push(product);
    }

    const before = this.stockOf(data, product.id);
    const batch: Batch = {
      id: `${product.id}:${randomUUID()}`,
      productKey: product.id,
      quantity: input.quantity,
      receivedOn: input.receivedOn,
      createdAt: new Date().toISOString(),
      expiresOn: input.expiresOn,
    };
    data.batches.push(batch);
    if (idemKey) this.idempotency.set(idemKey, batch.id);
    const after = this.stockOf(data, product.id).onShelf;

    return {
      product: { id: product.id, name: product.name, brand: product.brand, unit: product.unit, category: product.category },
      batch: { id: batch.id, quantity: batch.quantity, receivedOn: batch.receivedOn, expiresOn: batch.expiresOn },
      duplicate: false,
      totals: { before: before.onShelf, added: input.quantity, after, firstBatch: before.batches.length === 0 },
    };
  }

  async getCorrection(campusId: string, key: string): Promise<ProductCorrection | null> {
    return this.corrections.get(`${campusId}|${key}`) ?? null;
  }

  async saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void> {
    this.corrections.set(`${campusId}|${key}`, correction);
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
