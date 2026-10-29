// Supabase Store. SERVER-ONLY: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, never
// the NEXT_PUBLIC_*/anon keys. Plain row access; every rule lives in AppService.
// Requires migrations 002, 003 and 004. Partial unique indexes can't be targeted
// by ON CONFLICT, so duplicates are detected by the 23505 error code instead.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProductCorrection } from "@/lib/corrections";
import type {
  BatchDatePatch,
  BatchRec,
  CampusRec,
  CountCheckRec,
  HeldLine,
  HeldRec,
  IntakeReadRow,
  LedgerRec,
  NewBatch,
  NewHeld,
  NewLedger,
  NewOffer,
  NewPickup,
  NewProduct,
  NewRequest,
  OfferRec,
  OfferStatus,
  PickupRec,
  ProductPatch,
  ProductRec,
  RequestRec,
  Store,
} from "./store";

const UNIQUE_VIOLATION = "23505";
const PAGE = 1000; // PostgREST returns at most 1000 rows per request

type PgError = { message: string; code?: string } | null;
type PgList<T> = { data: T[] | null; error: PgError };

// ---- row shapes (snake_case, as in the database) ----
interface CampusRow { id: string; name: string; region: string | null; miles: number; live: boolean; student_token: string }
interface ProductRow {
  id: string; campus_id: string; product_key: string; name: string; brand: string | null; size_text: string | null;
  category: string; category_group: string | null; unit: string; no_expire: boolean; source: ProductRec["source"];
}
interface BatchRow {
  id: string; campus_id: string; product_id: string; quantity: number; received_on: string; expires_on: string | null;
  date_type: string | null; date_precision: BatchRec["datePrecision"]; date_source: BatchRec["dateSource"];
  idempotency_key: string | null; created_at: string;
}
interface LedgerRow {
  id: string; campus_id: string; product_id: string; delta: number; kind: LedgerRec["kind"]; source: LedgerRec["source"];
  reason: string | null; group_id: string | null; idempotency_key: string | null; created_at: string;
}
interface OfferRow {
  id: string; campus_id: string; product_id: string | null; name: string; unit: string | null; qty: number;
  category: string | null; expires_on: string | null; no_expire: boolean; status: OfferStatus; note: string | null; created_at: string;
}
interface RequestRow { id: string; campus_id: string; name: string; category: string | null; qty: number; offered: number | null; created_at: string }
interface PickupRow {
  id: string; offer_id: string | null; product_id: string | null; from_campus: string; to_campus: string; name: string;
  unit: string | null; qty: number; category: string | null; expires_on: string | null; no_expire: boolean;
  status: PickupRec["status"]; created_at: string;
}
interface HeldRow { id: string; campus_id: string; device_id: string; submission_id: string | null; lines: HeldLine[]; status: HeldRec["status"]; created_at: string }
interface CheckRow { id: string; campus_id: string; product_id: string; counted: number; status: CountCheckRec["status"] }

const campus = (r: CampusRow): CampusRec => ({
  id: r.id, name: r.name, region: r.region ?? "", miles: r.miles, live: r.live, studentToken: r.student_token,
});
const product = (r: ProductRow): ProductRec => ({
  id: r.id, campusId: r.campus_id, productKey: r.product_key, name: r.name, brand: r.brand, sizeText: r.size_text,
  category: r.category, categoryGroup: r.category_group, unit: r.unit, noExpire: r.no_expire, source: r.source,
});
const batch = (r: BatchRow): BatchRec => ({
  id: r.id, campusId: r.campus_id, productId: r.product_id, quantity: r.quantity, receivedOn: r.received_on,
  expiresOn: r.expires_on, dateType: r.date_type, datePrecision: r.date_precision, dateSource: r.date_source,
  idempotencyKey: r.idempotency_key, createdAt: r.created_at,
});
const ledger = (r: LedgerRow): LedgerRec => ({
  id: r.id, campusId: r.campus_id, productId: r.product_id, delta: r.delta, kind: r.kind, source: r.source,
  reason: r.reason, groupId: r.group_id, idempotencyKey: r.idempotency_key, createdAt: r.created_at,
});
const offer = (r: OfferRow): OfferRec => ({
  id: r.id, campusId: r.campus_id, productId: r.product_id, name: r.name, unit: r.unit ?? "item", qty: r.qty,
  category: r.category ?? "Uncategorized", expiresOn: r.expires_on, noExpire: r.no_expire, status: r.status,
  note: r.note, createdAt: r.created_at,
});
const request = (r: RequestRow): RequestRec => ({
  id: r.id, campusId: r.campus_id, name: r.name, category: r.category ?? "Uncategorized", qty: r.qty,
  offered: r.offered, createdAt: r.created_at,
});
const pickup = (r: PickupRow): PickupRec => ({
  id: r.id, offerId: r.offer_id, productId: r.product_id, fromCampus: r.from_campus, toCampus: r.to_campus,
  name: r.name, unit: r.unit ?? "item", qty: r.qty, category: r.category ?? "Uncategorized", expiresOn: r.expires_on,
  noExpire: r.no_expire, status: r.status, createdAt: r.created_at,
});
const held = (r: HeldRow): HeldRec => ({
  id: r.id, campusId: r.campus_id, deviceId: r.device_id, submissionId: r.submission_id ?? "", lines: r.lines ?? [],
  status: r.status, createdAt: r.created_at,
});

export class SupabaseStore implements Store {
  readonly name = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /** Read every row, a page at a time. */
  private async all<T>(label: string, make: (from: number, to: number) => PromiseLike<PgList<T>>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await make(from, from + PAGE - 1);
      if (error) throw new Error(`supabase ${label}: ${error.message}`);
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) return out;
    }
  }

  private fail(label: string, error: PgError): never {
    throw new Error(`supabase ${label}: ${error?.message ?? "unknown error"}`);
  }

  // ---- campuses
  async listCampuses() {
    const rows = await this.all<CampusRow>("campuses", (f, t) => this.db.from("campuses").select("*").order("id").range(f, t));
    return rows.map(campus);
  }

  // ---- products
  async listProducts(campusId: string) {
    const rows = await this.all<ProductRow>("products", (f, t) =>
      this.db.from("products").select("*").eq("campus_id", campusId).order("id").range(f, t),
    );
    return rows.map(product);
  }

  private async findProduct(campusId: string, productKey: string): Promise<ProductRec | null> {
    const { data, error } = await this.db
      .from("products").select("*").eq("campus_id", campusId).eq("product_key", productKey).maybeSingle();
    if (error) this.fail("product lookup", error);
    return data ? product(data as ProductRow) : null;
  }

  async upsertProduct(p: NewProduct): Promise<ProductRec> {
    const existing = await this.findProduct(p.campusId, p.productKey);
    if (existing) return existing;
    const { data, error } = await this.db
      .from("products")
      .insert({
        campus_id: p.campusId, product_key: p.productKey, name: p.name, brand: p.brand, size_text: p.sizeText,
        category: p.category, category_group: p.categoryGroup, unit: p.unit, no_expire: p.noExpire, source: p.source,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const again = await this.findProduct(p.campusId, p.productKey);
        if (again) return again;
      }
      this.fail("insert product", error);
    }
    return product(data as ProductRow);
  }

  async updateProduct(id: string, patch: ProductPatch) {
    const row: Record<string, unknown> = {};
    if (patch.productKey !== undefined) row.product_key = patch.productKey;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.brand !== undefined) row.brand = patch.brand;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.categoryGroup !== undefined) row.category_group = patch.categoryGroup;
    if (patch.unit !== undefined) row.unit = patch.unit;
    if (patch.noExpire !== undefined) row.no_expire = patch.noExpire;
    if (patch.source !== undefined) row.source = patch.source;
    if (Object.keys(row).length === 0) return "updated" as const;
    const { error } = await this.db.from("products").update(row).eq("id", id);
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return "conflict" as const; // (campus_id, product_key) taken
      this.fail("update product", error);
    }
    return "updated" as const;
  }

  // ---- batches
  async updateBatchDates(campusId: string, ids: string[], date: BatchDatePatch) {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from("item_batches")
      .update({
        expires_on: date.expiresOn, date_type: date.dateType, date_precision: date.datePrecision, date_source: date.dateSource,
      })
      .eq("campus_id", campusId)
      .in("id", ids);
    if (error) this.fail("update batch dates", error);
  }

  async listBatches(campusId: string) {
    const rows = await this.all<BatchRow>("batches", (f, t) =>
      this.db.from("item_batches").select("*").eq("campus_id", campusId).order("id").range(f, t),
    );
    return rows.map(batch);
  }

  async getBatchByKey(campusId: string, key: string) {
    const { data, error } = await this.db
      .from("item_batches").select("*").eq("campus_id", campusId).eq("idempotency_key", key).maybeSingle();
    if (error) this.fail("batch lookup", error);
    return data ? batch(data as BatchRow) : null;
  }

  async insertBatch(b: NewBatch) {
    if (b.idempotencyKey) {
      const existing = await this.getBatchByKey(b.campusId, b.idempotencyKey);
      if (existing) return { batch: existing, duplicate: true };
    }
    const { data, error } = await this.db
      .from("item_batches")
      .insert({
        campus_id: b.campusId, product_id: b.productId, quantity: b.quantity, received_on: b.receivedOn,
        expires_on: b.expiresOn, date_type: b.dateType, date_precision: b.datePrecision, date_source: b.dateSource,
        idempotency_key: b.idempotencyKey, ...(b.createdAt ? { created_at: b.createdAt } : {}),
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION && b.idempotencyKey) {
        const existing = await this.getBatchByKey(b.campusId, b.idempotencyKey);
        if (existing) return { batch: existing, duplicate: true };
      }
      this.fail("insert batch", error);
    }
    return { batch: batch(data as BatchRow), duplicate: false };
  }

  // ---- ledger
  async listLedger(campusId: string) {
    const rows = await this.all<LedgerRow>("ledger", (f, t) =>
      this.db.from("ledger_entries").select("*").eq("campus_id", campusId).order("id").range(f, t),
    );
    return rows.map(ledger);
  }

  async insertLedger(rows: NewLedger[]) {
    if (rows.length === 0) return "inserted" as const;
    const { error } = await this.db.from("ledger_entries").insert(
      rows.map((r) => ({
        campus_id: r.campusId, product_id: r.productId, delta: r.delta, kind: r.kind, source: r.source, reason: r.reason,
        group_id: r.groupId, idempotency_key: r.idempotencyKey, ...(r.createdAt ? { created_at: r.createdAt } : {}),
      })),
    );
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return "duplicate" as const; // one statement: nothing was inserted
      this.fail("insert ledger", error);
    }
    return "inserted" as const;
  }

  async deleteLedgerGroup(campusId: string, groupId: string) {
    const { error } = await this.db.from("ledger_entries").delete().eq("campus_id", campusId).eq("group_id", groupId);
    if (error) this.fail("delete ledger group", error);
  }

  // ---- community
  async listOffers() {
    const rows = await this.all<OfferRow>("offers", (f, t) => this.db.from("offers").select("*").order("id").range(f, t));
    return rows.map(offer);
  }

  async insertOffer(o: NewOffer) {
    const { data, error } = await this.db
      .from("offers")
      .insert({
        ...(o.id ? { id: o.id } : {}), campus_id: o.campusId, product_id: o.productId, name: o.name, unit: o.unit,
        qty: o.qty, category: o.category, expires_on: o.expiresOn, no_expire: o.noExpire, status: o.status, note: o.note,
      })
      .select("*")
      .single();
    if (error) this.fail("insert offer", error);
    return offer(data as OfferRow);
  }

  async updateOffer(id: string, patch: Partial<Pick<OfferRec, "status" | "note">>) {
    const { error } = await this.db.from("offers").update(patch).eq("id", id);
    if (error) this.fail("update offer", error);
  }

  async updateOfferQtyIf(id: string, expectedQty: number, qty: number, status: OfferStatus) {
    const { data, error } = await this.db
      .from("offers").update({ qty, status }).eq("id", id).eq("qty", expectedQty).eq("status", "open").select("id");
    if (error) this.fail("claim offer", error);
    return (data?.length ?? 0) > 0;
  }

  async listRequests() {
    const rows = await this.all<RequestRow>("requests", (f, t) => this.db.from("requests").select("*").order("id").range(f, t));
    return rows.map(request);
  }

  async insertRequest(r: NewRequest) {
    const { data, error } = await this.db
      .from("requests")
      .insert({ ...(r.id ? { id: r.id } : {}), campus_id: r.campusId, name: r.name, category: r.category, qty: r.qty, offered: r.offered })
      .select("*")
      .single();
    if (error) this.fail("insert request", error);
    return request(data as RequestRow);
  }

  async setRequestOffered(id: string, offered: number) {
    const { error } = await this.db.from("requests").update({ offered }).eq("id", id);
    if (error) this.fail("update request", error);
  }

  async listPickups() {
    const rows = await this.all<PickupRow>("pickups", (f, t) => this.db.from("pickups").select("*").order("id").range(f, t));
    return rows.map(pickup);
  }

  async insertPickup(p: NewPickup) {
    const { data, error } = await this.db
      .from("pickups")
      .insert({
        offer_id: p.offerId, product_id: p.productId, from_campus: p.fromCampus, to_campus: p.toCampus, name: p.name,
        unit: p.unit, qty: p.qty, category: p.category, expires_on: p.expiresOn, no_expire: p.noExpire, status: p.status,
      })
      .select("*")
      .single();
    if (error) this.fail("insert pickup", error);
    return pickup(data as PickupRow);
  }

  async markPickupCompleted(id: string) {
    const { error } = await this.db.from("pickups").update({ status: "completed" }).eq("id", id);
    if (error) this.fail("complete pickup", error);
  }

  // ---- held student submissions
  async listHeld(campusId: string) {
    const rows = await this.all<HeldRow>("held", (f, t) =>
      this.db.from("held_submissions").select("*").eq("campus_id", campusId).order("id").range(f, t),
    );
    return rows.map(held);
  }

  async findHeldBySubmission(campusId: string, submissionId: string) {
    const { data, error } = await this.db
      .from("held_submissions").select("*").eq("campus_id", campusId).eq("submission_id", submissionId).maybeSingle();
    if (error) this.fail("held lookup", error);
    return data ? held(data as HeldRow) : null;
  }

  async insertHeld(h: NewHeld) {
    const { data, error } = await this.db
      .from("held_submissions")
      .insert({ campus_id: h.campusId, device_id: h.deviceId, submission_id: h.submissionId, lines: h.lines, status: "held" })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        const existing = await this.findHeldBySubmission(h.campusId, h.submissionId);
        if (existing) return existing;
      }
      this.fail("insert held", error);
    }
    return held(data as HeldRow);
  }

  async setHeldStatus(id: string, status: "accepted" | "discarded") {
    const { error } = await this.db.from("held_submissions").update({ status }).eq("id", id);
    if (error) this.fail("update held", error);
  }

  // ---- student device log (random cookie id only)
  async lastStudentSubmissionAt(campusId: string, deviceId: string) {
    const { data, error } = await this.db
      .from("student_submissions").select("created_at").eq("campus_id", campusId).eq("device_id", deviceId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) this.fail("student submission lookup", error);
    return (data as { created_at: string } | null)?.created_at ?? null;
  }

  async recordStudentSubmission(campusId: string, deviceId: string, at: string) {
    const { error } = await this.db.from("student_submissions").insert({ campus_id: campusId, device_id: deviceId, created_at: at });
    if (error) this.fail("record student submission", error);
  }

  // ---- count checks
  async listCountChecks(campusId: string) {
    const rows = await this.all<CheckRow>("count checks", (f, t) =>
      this.db.from("count_checks").select("*").eq("campus_id", campusId).order("id").range(f, t),
    );
    return rows.map((r): CountCheckRec => ({ id: r.id, campusId: r.campus_id, productId: r.product_id, counted: r.counted, status: r.status }));
  }

  async setCountCheckStatus(id: string, status: "resolved" | "dismissed") {
    const { error } = await this.db.from("count_checks").update({ status }).eq("id", id);
    if (error) this.fail("update count check", error);
  }

  // ---- remembered fixes (full unique constraint, so upsert works here)
  async getCorrection(campusId: string, key: string): Promise<ProductCorrection | null> {
    const { data, error } = await this.db
      .from("product_corrections").select("corrected_name, corrected_brand, corrected_category")
      .eq("campus_id", campusId).eq("read_key", key).maybeSingle();
    if (error || !data) return null;
    return { name: data.corrected_name ?? null, brand: data.corrected_brand ?? null, category: data.corrected_category ?? null };
  }

  async saveCorrection(campusId: string, key: string, c: ProductCorrection) {
    const { error } = await this.db.from("product_corrections").upsert(
      {
        campus_id: campusId, read_key: key, corrected_name: c.name, corrected_brand: c.brand,
        corrected_category: c.category, updated_at: new Date().toISOString(),
      },
      { onConflict: "campus_id,read_key" },
    );
    if (error) this.fail("save correction", error);
  }

  // ---- accuracy log
  async insertIntakeRead(row: IntakeReadRow) {
    const { error } = await this.db.from("intake_reads").insert({
      batch_id: row.batchId, model: row.model, read_name: row.readName, read_date_raw: row.readDateRaw,
      read_expires_on: row.readExpiresOn, name_confidence: row.nameConfidence, date_confidence: row.dateConfidence,
      edited_fields: row.editedFields,
    });
    if (error) this.fail("insert intake read", error);
  }
}
