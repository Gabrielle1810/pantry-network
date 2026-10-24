// In-memory repository (UI13.5). Used for local dev and all tests. Seeded with
// clearly-fake Campus A data so the saved-screen totals show a non-zero
// "before". Per-process and non-persistent: on Vercel it resets per serverless
// instance, which is exactly why the deployed demo needs Supabase (UI13.8).
import { randomUUID } from "node:crypto";
import type { ItemBatch } from "@/lib/items/schema";
import { computeArrivedExpired } from "@/lib/items/schema";
import { correctionKey, type ProductCorrection } from "@/lib/corrections";
import type { ItemRepository, SaveBatchInput } from "./types";

function seedBatch(partial: Partial<ItemBatch> & Pick<ItemBatch, "name" | "quantity">): ItemBatch {
  const received = partial.received_on ?? "2026-10-20";
  return {
    id: partial.id ?? randomUUID(),
    campus_id: partial.campus_id ?? "campus-a",
    idempotency_key: partial.idempotency_key ?? null,
    name: partial.name,
    brand: partial.brand ?? null,
    size_text: partial.size_text ?? null,
    category: partial.category ?? "Uncategorized",
    category_group: partial.category_group ?? null,
    quantity: partial.quantity,
    unit: partial.unit ?? "item",
    received_on: received,
    expires_on: partial.expires_on ?? null,
    date_type: partial.date_type ?? null,
    date_precision: partial.date_precision ?? null,
    date_source: partial.date_source ?? null,
    dont_track: partial.dont_track ?? false,
    doesnt_expire: partial.doesnt_expire ?? false,
    perishable: partial.perishable ?? false,
    arrived_expired:
      partial.arrived_expired ?? computeArrivedExpired(partial.expires_on ?? null, received),
    source: partial.source ?? null,
    edited_fields: partial.edited_fields ?? [],
    created_at: partial.created_at ?? new Date(received).toISOString(),
  };
}

export class MemoryRepository implements ItemRepository {
  readonly name = "memory" as const;
  private batches: ItemBatch[] = [];
  private idempotency = new Map<string, string>(); // key → batch id
  private corrections = new Map<string, ProductCorrection>(); // campus|key → correction

  constructor(seed = true) {
    if (seed) {
      // Fake Campus A shelf so "before on the shelf" is non-zero in the demo.
      this.batches.push(
        seedBatch({ name: "Tomato paste", brand: "Hunt's", category: "Sauces/Pastes/Spread", quantity: 2, unit: "can" }),
        seedBatch({ name: "Black beans, canned, 15 oz", brand: "Campus Brand", category: "Canned Goods", quantity: 6, unit: "can" }),
      );
    }
  }

  async saveBatch(input: SaveBatchInput): Promise<ItemBatch> {
    if (input.idempotencyKey) {
      const existingId = this.idempotency.get(input.idempotencyKey);
      if (existingId) {
        const existing = this.batches.find((b) => b.id === existingId);
        if (existing) return existing; // idempotent (UI13.3)
      }
    }
    const batch: ItemBatch = {
      id: randomUUID(),
      campus_id: input.campusId,
      idempotency_key: input.idempotencyKey,
      name: input.batch.name,
      brand: input.batch.brand,
      size_text: input.batch.size_text,
      category: input.batch.category,
      category_group: input.batch.category_group,
      quantity: input.batch.quantity,
      unit: input.batch.unit,
      received_on: input.receivedOn,
      expires_on: input.batch.expires_on,
      date_type: input.batch.date_type,
      date_precision: input.batch.date_precision,
      date_source: input.batch.date_source,
      dont_track: input.batch.dont_track,
      doesnt_expire: input.batch.doesnt_expire,
      perishable: input.batch.perishable,
      arrived_expired: input.arrivedExpired,
      source: input.batch.source,
      edited_fields: input.editedFields,
      created_at: new Date().toISOString(),
    };
    this.batches.push(batch);
    if (input.idempotencyKey) this.idempotency.set(input.idempotencyKey, batch.id);
    return batch;
  }

  async listBatches(
    campusId: string,
    since: "today" | string,
    todayIso: string,
  ): Promise<ItemBatch[]> {
    const floor = since === "today" ? todayIso : since;
    return this.batches
      .filter((b) => b.campus_id === campusId && b.received_on >= floor)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async getCorrection(campusId: string, key: string): Promise<ProductCorrection | null> {
    return this.corrections.get(`${campusId}|${key}`) ?? null;
  }

  async saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void> {
    void correctionKey; // key is already normalized by the caller
    this.corrections.set(`${campusId}|${key}`, correction);
  }
}
