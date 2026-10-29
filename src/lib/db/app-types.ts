// App repository surface: the derived-stock read model plus intake (Step 3) and
// remembered fixes. Every save creates or reuses a product (by product_key) and
// adds an item_batch, so new stock shows in Inventory immediately. The old
// Phase-1 `items` table is no longer written.
import type { Status } from "@/lib/status";
import type { ProductCorrection } from "@/lib/corrections";
import type { FeedEntry, FeedLine, LineInput, ReasonCode } from "@/lib/takeout";
import type { HistoryEntry, ProductEdit } from "@/lib/inventory/edit";
import type { OfferRec, PickupRec, RequestRec } from "./store";

export interface EditProductInput {
  campusId: string;
  productId: string;
  edit: ProductEdit;
}

export type EditProductResult =
  | { status: "saved"; row: InventoryRow; changed: string[]; dateSkipped: boolean }
  | { status: "unchanged"; row: InventoryRow }
  | { status: "not_found" }
  /** Another product here already has this name + brand. Nothing was changed. */
  | { status: "conflict" }
  /** The new on-shelf number is below what is set aside for Community. Nothing was changed. */
  | { status: "reserved"; reserved: number };

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

export interface CampusInfo {
  id: string;
  name: string;
  region: string;
  miles: number;
  live: boolean;
  /** Random token for the public student URL (never the campus id). */
  studentToken: string;
}

export interface RecordOutInput {
  campusId: string;
  reason: ReasonCode;
  lines: LineInput[];
  /** One per attempt, so a double-click doesn't record twice. */
  idempotencyKey: string | null;
}

export interface RecordOutResult {
  status: "recorded" | "duplicate" | "empty";
  /** The feed entry's group (null when items were only reserved for Community). */
  groupId: string | null;
  /** Offers created by "Moved to Community" (they reserve stock, not subtract it). */
  offerIds: string[];
  lines: FeedLine[];
}

export interface StudentTakeoutInput {
  campusId: string;
  /** Random device-cookie id. Never a name or IP. */
  deviceId: string;
  /** Client-generated per Done press; makes retries idempotent. */
  submissionId: string;
  lines: LineInput[];
}

export interface StudentTakeoutResult {
  /** "held" = same device inside 2 minutes; no stock change until staff accept. */
  status: "recorded" | "held" | "empty";
  lines: { productId: string; name: string; qty: number }[];
}

export interface CountCheckView {
  id: string;
  productId: string;
  name: string;
  unit: string;
  category: string;
  counted: number;
  /** What the system currently says is on the shelf. */
  system: number;
}

export interface AppRepository {
  readonly name: "memory" | "supabase";
  listCampuses(): Promise<
    { id: string; name: string; region: string; miles: number; live: boolean }[]
  >;
  getCampus(campusId: string): Promise<CampusInfo | null>;
  /** Resolves the public student token to its campus. */
  getCampusByToken(token: string): Promise<CampusInfo | null>;
  /** Derived inventory rows for a campus (manager view). */
  listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]>;
  /** Student-visible rows: in stock minus reserved, not expired (PI.2). */
  listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]>;
  /** One derived row, or null. */
  getProduct(campusId: string, productId: string, todayIso: string): Promise<InventoryRow | null>;
  /** Recent history per product (newest first), for the edit drawer. */
  listHistory(campusId: string): Promise<Record<string, HistoryEntry[]>>;
  /**
   * Edit drawer / Full sheet (PD.7, PD.7a, PD.10). Details are updated in place;
   * an on-shelf change is written as an "Edited by staff" adjustment for the
   * difference and never overwrites a stored number. Batch quantities never change.
   */
  editProduct(input: EditProductInput, todayIso: string): Promise<EditProductResult>;
  /** Create/reuse the product by product_key and add a batch (idempotent). */
  saveIntake(input: IntakeInput): Promise<IntakeResult>;
  /** Remembered fix for a read key (normalized read name|brand). Never dates. */
  getCorrection(campusId: string, key: string): Promise<ProductCorrection | null>;
  saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void>;

  // ---- Take-out (Step 4) ----
  /**
   * Staff removal. Quantities are capped at on-shelf minus reserved. "Moved to
   * Community" does NOT subtract stock: it creates open offers that reserve it.
   */
  recordOut(input: RecordOutInput, todayIso: string): Promise<RecordOutResult>;
  /** Public student take-out (already resolved from its token to a campus). */
  studentTakeout(input: StudentTakeoutInput, todayIso: string, nowMs?: number): Promise<StudentTakeoutResult>;
  /** Today's feed (campus time zone) plus held submissions. No names. */
  listFeed(campusId: string, todayIso: string): Promise<FeedEntry[]>;
  /** Change an entry's quantities; stock moves by the difference via ledger rows. */
  fixEntry(campusId: string, groupId: string, lines: LineInput[], todayIso: string): Promise<boolean>;
  /** Delete an entry: puts its stock back through ledger rows. */
  deleteEntry(campusId: string, groupId: string, todayIso: string): Promise<boolean>;
  /** Undo a just-recorded entry (only within a short window) and withdraw offers it made. */
  undoEntry(campusId: string, groupId: string | null, offerIds: string[], nowMs?: number): Promise<boolean>;
  /** Accept (apply the take-out now) or discard a held student submission. */
  resolveHeld(campusId: string, heldId: string, accept: boolean, todayIso: string): Promise<boolean>;
  listCountChecks(campusId: string, todayIso: string): Promise<CountCheckView[]>;
  /** Use the counted number (writes a recount ledger entry) or keep the system's. */
  resolveCountCheck(campusId: string, checkId: string, useCounted: boolean, todayIso: string): Promise<boolean>;

  // ---- Community offers that reserve stock ----
  createOffer(input: CreateOfferInput, todayIso: string): Promise<{ offerId: string; qty: number } | null>;
  withdrawOffer(campusId: string, offerId: string): Promise<boolean>;

  // ---- Community (Step 5) ----
  /** Everything the Community page needs for the active campus. */
  listCommunity(campusId: string, todayIso: string): Promise<CommunitySnapshot>;
  createRequest(input: CreateRequestInput): Promise<{ requestId: string } | null>;
  /**
   * Claim part or all of another campus's open offer → a pending pickup. The
   * units stay reserved at the offering campus until the pickup is completed.
   */
  claimOffer(campusId: string, offerId: string, qty: number): Promise<{ pickupId: string; qty: number } | null>;
  /**
   * "Mark picked up" (by the claiming campus). Subtracts from the offering
   * campus exactly once, releases the reservation, and adds an intake batch to
   * the claiming campus. Repeating it changes nothing.
   */
  completePickup(campusId: string, pickupId: string, todayIso: string): Promise<CompletePickupResult | null>;
}

export interface CommunitySnapshot {
  rows: InventoryRow[];
  offers: OfferRec[];
  requests: RequestRec[];
  pickups: PickupRec[];
}

export interface CreateRequestInput {
  campusId: string;
  name: string;
  category: string;
  qty: number;
}

export interface CompletePickupResult {
  /** Units that left the offering campus and arrived here. */
  moved: number;
  /** True if this pickup had already been completed (nothing changed). */
  duplicate: boolean;
  product: { id: string; name: string; unit: string; category: string };
  before: number;
  after: number;
}

export interface CreateOfferInput {
  campusId: string;
  productId: string;
  qty: number;
  note: string | null;
  /** A request this offer answers. */
  requestId?: string | null;
}
