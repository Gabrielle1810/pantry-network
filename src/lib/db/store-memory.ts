// In-memory Store: local dev and tests. Seeded from the shared plan with two
// live campuses (harbor full, cedar smaller) and random student tokens. It is
// per-process, so on Vercel it resets per serverless instance; the deployed
// demo uses Supabase.
import { randomBytes, randomUUID } from "node:crypto";
import { CAMPUSES } from "@/lib/campus";
import type { ProductCorrection } from "@/lib/corrections";
import { buildSeedPlan } from "./seed";
import type {
  BatchRec,
  CampusRec,
  CountCheckRec,
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
  ProductRec,
  RequestRec,
  Store,
} from "./store";

export class MemoryStore implements Store {
  readonly name = "memory" as const;
  private campuses: CampusRec[];
  private products: ProductRec[] = [];
  private batches: BatchRec[] = [];
  private ledger: LedgerRec[] = [];
  private offers: OfferRec[] = [];
  private requests: RequestRec[] = [];
  private pickups: PickupRec[] = [];
  private held: HeldRec[] = [];
  private submissions: { campusId: string; deviceId: string; at: string }[] = [];
  private checks: CountCheckRec[] = [];
  private corrections = new Map<string, ProductCorrection>();
  readonly intakeReads: IntakeReadRow[] = [];

  constructor(todayIso: string, nowMs: number = Date.now()) {
    this.campuses = Object.values(CAMPUSES).map((c) => ({
      id: c.id,
      name: c.name,
      region: c.region,
      miles: c.miles,
      live: c.live,
      studentToken: randomBytes(24).toString("base64url"),
    }));

    const plan = buildSeedPlan(todayIso, nowMs);
    for (const { campusId, items } of plan.campuses) {
      for (const item of items) {
        const productId = `${campusId}:${item.ref}`;
        this.products.push({ id: productId, ...item.product });
        for (const b of item.batches) {
          this.batches.push({
            id: b.key,
            campusId,
            productId,
            quantity: b.quantity,
            receivedOn: b.receivedOn,
            expiresOn: b.expiresOn,
            dateType: null,
            datePrecision: null,
            dateSource: "imported",
            idempotencyKey: b.key,
            createdAt: b.createdAt,
          });
        }
        for (const l of item.ledger) {
          this.ledger.push({
            id: l.key,
            campusId,
            productId,
            delta: l.delta,
            kind: l.kind,
            source: l.source,
            reason: l.reason,
            groupId: l.groupKey,
            idempotencyKey: l.key,
            createdAt: l.createdAt,
          });
        }
      }
    }
    const at = new Date(nowMs).toISOString();
    for (const o of plan.offers) {
      this.offers.push({
        id: `seed-${o.id}`,
        campusId: o.campusId,
        productId: o.productRef ? `${o.campusId}:${o.productRef}` : null,
        name: o.name,
        unit: o.unit,
        qty: o.qty,
        category: o.category,
        expiresOn: o.expiresOn,
        noExpire: o.noExpire,
        status: "open",
        note: null,
        createdAt: at,
      });
    }
    for (const r of plan.requests) {
      this.requests.push({ id: `seed-${r.id}`, campusId: r.campusId, name: r.name, category: r.category, qty: r.qty, offered: null, createdAt: at });
    }
    for (const c of plan.counts) {
      this.checks.push({ id: `seed-${c.id}`, campusId: c.campusId, productId: `${c.campusId}:${c.ref}`, counted: c.counted, status: "open" });
    }
  }

  async listCampuses() {
    return this.campuses.map((c) => ({ ...c }));
  }

  async listProducts(campusId: string) {
    return this.products.filter((p) => p.campusId === campusId).map((p) => ({ ...p }));
  }

  async upsertProduct(p: NewProduct): Promise<ProductRec> {
    const existing = this.products.find((x) => x.campusId === p.campusId && x.productKey === p.productKey);
    if (existing) return { ...existing };
    const created: ProductRec = { id: `${p.campusId}:${randomUUID()}`, ...p };
    this.products.push(created);
    return { ...created };
  }

  async listBatches(campusId: string) {
    return this.batches.filter((b) => b.campusId === campusId).map((b) => ({ ...b }));
  }

  async getBatchByKey(campusId: string, key: string) {
    const b = this.batches.find((x) => x.campusId === campusId && x.idempotencyKey === key);
    return b ? { ...b } : null;
  }

  async insertBatch(b: NewBatch) {
    if (b.idempotencyKey) {
      const existing = this.batches.find((x) => x.campusId === b.campusId && x.idempotencyKey === b.idempotencyKey);
      if (existing) return { batch: { ...existing }, duplicate: true };
    }
    const created: BatchRec = { ...b, id: randomUUID(), createdAt: b.createdAt ?? new Date().toISOString() };
    this.batches.push(created);
    return { batch: { ...created }, duplicate: false };
  }

  async listLedger(campusId: string) {
    return this.ledger.filter((l) => l.campusId === campusId).map((l) => ({ ...l }));
  }

  async insertLedger(rows: NewLedger[]) {
    for (const r of rows) {
      if (r.idempotencyKey && this.ledger.some((x) => x.campusId === r.campusId && x.idempotencyKey === r.idempotencyKey)) {
        return "duplicate" as const;
      }
    }
    const now = new Date().toISOString();
    for (const r of rows) this.ledger.push({ ...r, id: randomUUID(), createdAt: r.createdAt ?? now });
    return "inserted" as const;
  }

  async deleteLedgerGroup(campusId: string, groupId: string) {
    this.ledger = this.ledger.filter((l) => !(l.campusId === campusId && l.groupId === groupId));
  }

  async listOffers() {
    return this.offers.map((o) => ({ ...o }));
  }

  async insertOffer(o: NewOffer) {
    const created: OfferRec = { ...o, id: o.id ?? randomUUID(), createdAt: o.createdAt ?? new Date().toISOString() };
    this.offers.push(created);
    return { ...created };
  }

  async updateOffer(id: string, patch: Partial<Pick<OfferRec, "status" | "note">>) {
    const o = this.offers.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  }

  async updateOfferQtyIf(id: string, expectedQty: number, qty: number, status: OfferStatus) {
    const o = this.offers.find((x) => x.id === id);
    if (!o || o.qty !== expectedQty || o.status !== "open") return false;
    o.qty = qty;
    o.status = status;
    return true;
  }

  async listRequests() {
    return this.requests.map((r) => ({ ...r }));
  }

  async insertRequest(r: NewRequest) {
    const created: RequestRec = { ...r, id: r.id ?? randomUUID(), createdAt: r.createdAt ?? new Date().toISOString() };
    this.requests.push(created);
    return { ...created };
  }

  async setRequestOffered(id: string, offered: number) {
    const r = this.requests.find((x) => x.id === id);
    if (r) r.offered = offered;
  }

  async listPickups() {
    return this.pickups.map((p) => ({ ...p }));
  }

  async insertPickup(p: NewPickup) {
    const created: PickupRec = { ...p, id: randomUUID(), createdAt: new Date().toISOString() };
    this.pickups.push(created);
    return { ...created };
  }

  async markPickupCompleted(id: string) {
    const p = this.pickups.find((x) => x.id === id);
    if (p) p.status = "completed";
  }

  async listHeld(campusId: string) {
    return this.held.filter((h) => h.campusId === campusId).map((h) => ({ ...h, lines: h.lines.map((l) => ({ ...l })) }));
  }

  async findHeldBySubmission(campusId: string, submissionId: string) {
    const h = this.held.find((x) => x.campusId === campusId && x.submissionId === submissionId);
    return h ? { ...h, lines: h.lines.map((l) => ({ ...l })) } : null;
  }

  async insertHeld(h: NewHeld) {
    const created: HeldRec = { ...h, id: randomUUID(), status: "held", createdAt: new Date().toISOString() };
    this.held.push(created);
    return { ...created };
  }

  async setHeldStatus(id: string, status: "accepted" | "discarded") {
    const h = this.held.find((x) => x.id === id);
    if (h) h.status = status;
  }

  async lastStudentSubmissionAt(campusId: string, deviceId: string) {
    const times = this.submissions.filter((s) => s.campusId === campusId && s.deviceId === deviceId).map((s) => s.at);
    return times.length ? times.sort().at(-1)! : null;
  }

  async recordStudentSubmission(campusId: string, deviceId: string, at: string) {
    this.submissions.push({ campusId, deviceId, at });
  }

  async listCountChecks(campusId: string) {
    return this.checks.filter((c) => c.campusId === campusId).map((c) => ({ ...c }));
  }

  async setCountCheckStatus(id: string, status: "resolved" | "dismissed") {
    const c = this.checks.find((x) => x.id === id);
    if (c) c.status = status;
  }

  async getCorrection(campusId: string, key: string) {
    return this.corrections.get(`${campusId}|${key}`) ?? null;
  }

  async saveCorrection(campusId: string, key: string, c: ProductCorrection) {
    this.corrections.set(`${campusId}|${key}`, c);
  }

  async insertIntakeRead(row: IntakeReadRow) {
    this.intakeReads.push(row);
  }
}
