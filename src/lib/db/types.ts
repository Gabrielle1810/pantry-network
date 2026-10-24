// Repository interface (UI13.5). The save pipeline and routes depend only on
// this interface, never on a concrete repo, so Memory ↔ Supabase swap with no
// code change (R13.5).
import type { ItemBatch, BatchInput } from "@/lib/items/schema";
import type { ProductCorrection } from "@/lib/corrections";

export type RepositoryName = "memory" | "supabase";

/** What the route hands the repo to save one batch (plus its read + edits). */
export interface SaveBatchInput {
  campusId: string;
  idempotencyKey: string | null;
  receivedOn: string; // ISO date, campus tz
  batch: BatchInput;
  arrivedExpired: boolean;
  editedFields: string[];
  /** The original AI read, stored in intake_reads for accuracy measurement. */
  read: {
    model: string | null;
    read_name: string | null;
    read_date_raw: string | null;
    read_expires_on: string | null;
    name_confidence: number | null;
    date_confidence: number | null;
  } | null;
}

export interface ItemRepository {
  readonly name: RepositoryName;
  /** Save one batch idempotently; a repeat idempotencyKey returns the existing batch. */
  saveBatch(input: SaveBatchInput): Promise<ItemBatch>;
  /** Batches for a campus. `since` is "today" (campus tz) or an ISO date floor. */
  listBatches(campusId: string, since: "today" | string, todayIso: string): Promise<ItemBatch[]>;
  /** Look up a remembered fix by correction key. */
  getCorrection(campusId: string, key: string): Promise<ProductCorrection | null>;
  /** Store/replace a remembered fix for a correction key. */
  saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void>;
}
