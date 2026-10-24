// App-level read model (Step 1). This is the derived-stock surface the manager
// Inventory and the student page read from. It sits alongside the Phase-1
// ItemRepository (batch save + corrections), which stays as-is during the
// transition (design §10). Later steps add write methods (takeout, community).
import type { Status } from "@/lib/status";

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
  /** Soonest relevant expiry (ISO) or null. */
  expiresOn: string | null;
  status: Status;
}

/** Read surface for the derived app model. */
export interface AppReadRepository {
  readonly name: "memory" | "supabase";
  listCampuses(): Promise<
    { id: string; name: string; region: string; miles: number; live: boolean }[]
  >;
  /** Derived inventory rows for a campus (manager view). */
  listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]>;
  /** Student-visible rows: in stock minus reserved, not expired (PI.2). */
  listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]>;
}
