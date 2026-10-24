// App repository surface: the derived-stock read model plus intake (Step 3) and
// remembered fixes. Every save creates or reuses a product (by product_key) and
// adds an item_batch, so new stock shows in Inventory immediately. The old
// Phase-1 `items` table is no longer written.
import type { Status } from "@/lib/status";
import type { ProductCorrection } from "@/lib/corrections";

/** A product with its derived stock + status, ready for the Inventory table. */
export interface InventoryRow {
  productId: string;
  campusId: string;
  productKey: string;
  name: string;
  brand: string | null;
  unit: string;
  category: string;
  categoryGroup: string | null;
  source: "donated" | "purchased" | null;
  noExpire: boolean;
  /** Derived on-shelf quantity (batches + ledger, floored at 0). */
  onShelf: number;
  /** Quantity reserved by open Community offers (hidden from students). */
  reserved: number;
  /** Most recent intake batch quantity ("of"). */
  lastRestock: number;
  /** Most recent intake batch received date (ISO). */
  lastRestockOn: string | null;
  /** Soonest expiry among batches that still have units (ISO) or null. */
  expiresOn: string | null;
  status: Status;
}

/** One intake save: a product identity + one batch. */
export interface IntakeInput {
  campusId: string;
  idempotencyKey: string | null;
  receivedOn: string;
  product: {
    name: string;
    brand: string | null;
    sizeText: string | null;
    category: string;
    categoryGroup: string | null;
    unit: string;
    noExpire: boolean;
    source: "donated" | "purchased" | null;
  };
  quantity: number;
  expiresOn: string | null;
  dateType: string | null;
  datePrecision: "day" | "month" | null;
  dateSource: "photo" | "typed" | "imported" | "estimated" | null;
  editedFields: string[];
  /** Original AI read for the accuracy log (intake_reads); null for typed saves. */
  read: {
    model: string | null;
    readName: string | null;
    readDateRaw: string | null;
    readExpiresOn: string | null;
    nameConfidence: number | null;
    dateConfidence: number | null;
  } | null;
}

export interface IntakeResult {
  product: { id: string; name: string; brand: string | null; unit: string; category: string };
  batch: { id: string; quantity: number; receivedOn: string; expiresOn: string | null };
  /** True when the idempotency key was already used (nothing new was added). */
  duplicate: boolean;
  totals: { before: number; added: number; after: number; firstBatch: boolean };
}

export interface AppRepository {
  readonly name: "memory" | "supabase";
  listCampuses(): Promise<
    { id: string; name: string; region: string; miles: number; live: boolean }[]
  >;
  /** Derived inventory rows for a campus (manager view). */
  listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]>;
  /** Student-visible rows: in stock minus reserved, not expired (PI.2). */
  listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]>;
  /** One derived row, or null. */
  getProduct(campusId: string, productId: string, todayIso: string): Promise<InventoryRow | null>;
  /** Create/reuse the product by product_key and add a batch (idempotent). */
  saveIntake(input: IntakeInput): Promise<IntakeResult>;
  /** Remembered fix for a read key (normalized read name|brand). Never dates. */
  getCorrection(campusId: string, key: string): Promise<ProductCorrection | null>;
  saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void>;
}
