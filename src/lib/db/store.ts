// Storage primitives. The business rules live in AppService (service.ts) and run
// identically over any Store; a Store is just rows in and rows out. MemoryStore
// is used locally and in tests, SupabaseStore on the deployed app.
import type { ProductCorrection } from "@/lib/corrections";
import type { LedgerKind } from "@/lib/stock";

export type DeliverySourceRec = "donated" | "purchased" | null;
export type LedgerSource = "student" | "staff" | "system";

export interface CampusRec {
  id: string;
  name: string;
  region: string;
  miles: number;
  live: boolean;
  /** Random, unguessable token for the public student URL. */
  studentToken: string;
}

export interface ProductRec {
  id: string;
  campusId: string;
  productKey: string;
  name: string;
  brand: string | null;
  sizeText: string | null;
  category: string;
  categoryGroup: string | null;
  unit: string;
  noExpire: boolean;
  source: DeliverySourceRec;
}
export type NewProduct = Omit<ProductRec, "id">;

export interface BatchRec {
  id: string;
  campusId: string;
  productId: string;
  quantity: number;
  receivedOn: string;
  expiresOn: string | null;
  dateType: string | null;
  datePrecision: "day" | "month" | null;
  dateSource: "photo" | "typed" | "imported" | "estimated" | null;
  idempotencyKey: string | null;
  createdAt: string;
}
export type NewBatch = Omit<BatchRec, "id" | "createdAt"> & { createdAt?: string };

/** Append-only. There is deliberately no person/name field (no-names rule). */
export interface LedgerRec {
  id: string;
  campusId: string;
  productId: string;
  /** Signed change to on-shelf; negative leaves the shelf. */
  delta: number;
  kind: LedgerKind;
  source: LedgerSource;
  reason: string | null;
  /** Rows of one take-out/removal share a group (one feed entry). */
  groupId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}
export type NewLedger = Omit<LedgerRec, "id" | "createdAt"> & { createdAt?: string };

export type OfferStatus = "open" | "claimed" | "withdrawn" | "completed";
export interface OfferRec {
  id: string;
  campusId: string;
  productId: string | null;
  name: string;
  unit: string;
  qty: number;
  category: string;
  expiresOn: string | null;
  noExpire: boolean;
  status: OfferStatus;
  note: string | null;
  createdAt: string;
}
export type NewOffer = Omit<OfferRec, "id" | "createdAt"> & { id?: string; createdAt?: string };

export interface RequestRec {
  id: string;
  campusId: string;
  name: string;
  category: string;
  qty: number;
  offered: number | null;
  createdAt: string;
}
export type NewRequest = Omit<RequestRec, "id" | "createdAt"> & { id?: string; createdAt?: string };

export interface PickupRec {
  id: string;
  offerId: string | null;
  /** The offering campus's product (null for sample campuses with no inventory). */
  productId: string | null;
  fromCampus: string;
  toCampus: string;
  name: string;
  unit: string;
  qty: number;
  category: string;
  expiresOn: string | null;
  noExpire: boolean;
  status: "pending" | "completed";
  createdAt: string;
}
export type NewPickup = Omit<PickupRec, "id" | "createdAt">;

export interface HeldLine {
  productId: string;
  qty: number;
}
export interface HeldRec {
  id: string;
  campusId: string;
  /** Random device cookie id. Never a name, never an IP. */
  deviceId: string;
  submissionId: string;
  lines: HeldLine[];
  status: "held" | "accepted" | "discarded";
  createdAt: string;
}
export type NewHeld = Omit<HeldRec, "id" | "createdAt" | "status">;

export interface CountCheckRec {
  id: string;
  campusId: string;
  productId: string;
  counted: number;
  status: "open" | "resolved" | "dismissed";
}

export interface IntakeReadRow {
  batchId: string;
  model: string | null;
  readName: string | null;
  readDateRaw: string | null;
  readExpiresOn: string | null;
  nameConfidence: number | null;
  dateConfidence: number | null;
  editedFields: string[];
}

export interface Store {
  readonly name: "memory" | "supabase";

  listCampuses(): Promise<CampusRec[]>;

  listProducts(campusId: string): Promise<ProductRec[]>;
  /** Insert, or return the existing product with the same (campusId, productKey). */
  upsertProduct(p: NewProduct): Promise<ProductRec>;

  listBatches(campusId: string): Promise<BatchRec[]>;
  getBatchByKey(campusId: string, key: string): Promise<BatchRec | null>;
  /** A repeated idempotencyKey inserts nothing and returns the existing batch. */
  insertBatch(b: NewBatch): Promise<{ batch: BatchRec; duplicate: boolean }>;

  listLedger(campusId: string): Promise<LedgerRec[]>;
  /** All-or-nothing; "duplicate" (nothing inserted) if any idempotencyKey already exists. */
  insertLedger(rows: NewLedger[]): Promise<"inserted" | "duplicate">;
  deleteLedgerGroup(campusId: string, groupId: string): Promise<void>;

  /** Offers, requests and pickups span campuses, so they are not campus-filtered. */
  listOffers(): Promise<OfferRec[]>;
  insertOffer(o: NewOffer): Promise<OfferRec>;
  updateOffer(id: string, patch: Partial<Pick<OfferRec, "status" | "note">>): Promise<void>;
  /** Set qty/status only if qty is still `expectedQty` (guards double claims). */
  updateOfferQtyIf(id: string, expectedQty: number, qty: number, status: OfferStatus): Promise<boolean>;

  listRequests(): Promise<RequestRec[]>;
  insertRequest(r: NewRequest): Promise<RequestRec>;
  setRequestOffered(id: string, offered: number): Promise<void>;

  listPickups(): Promise<PickupRec[]>;
  insertPickup(p: NewPickup): Promise<PickupRec>;
  markPickupCompleted(id: string): Promise<void>;

  listHeld(campusId: string): Promise<HeldRec[]>;
  findHeldBySubmission(campusId: string, submissionId: string): Promise<HeldRec | null>;
  insertHeld(h: NewHeld): Promise<HeldRec>;
  setHeldStatus(id: string, status: "accepted" | "discarded"): Promise<void>;

  /** Last time this device had a take-out applied (ISO), or null. */
  lastStudentSubmissionAt(campusId: string, deviceId: string): Promise<string | null>;
  recordStudentSubmission(campusId: string, deviceId: string, at: string): Promise<void>;

  listCountChecks(campusId: string): Promise<CountCheckRec[]>;
  setCountCheckStatus(id: string, status: "resolved" | "dismissed"): Promise<void>;

  getCorrection(campusId: string, key: string): Promise<ProductCorrection | null>;
  saveCorrection(campusId: string, key: string, c: ProductCorrection): Promise<void>;

  insertIntakeRead(row: IntakeReadRow): Promise<void>;
}
