// AppService: every business rule that touches storage, written once over a
// Store (memory or Supabase). Stock is never stored; it is derived from batches
// plus ledger rows. Reservations (open offers + pending pickups) are subtracted
// from what staff and students can act on, but never from stock itself. Stock
// leaves a campus for Community only when a pickup is marked picked up.
import { randomUUID } from "node:crypto";
import { correctionKey, type ProductCorrection } from "@/lib/corrections";
import { categoryGroup, normalizeCategory } from "@/lib/items/taxonomy";
import {
  activeSoonestExpiry,
  deriveOnShelf,
  lastRestockAmount,
  remainingByBatch,
  sortFIFO,
  type Batch,
  type Ledger,
} from "@/lib/stock";
import {
  BEST_BY_LABEL,
  EDIT_REASON,
  ON_SHELF_LABEL,
  historyEntries,
  planEdit,
  type HistoryEntry,
} from "@/lib/inventory/edit";
import { statusOf } from "@/lib/status";
import { isRepeatSubmission, isStudentVisible, studentAvailable } from "@/lib/student";
import {
  UNDO_SERVER_WINDOW_MS,
  buildFeed,
  clampLines,
  planFix,
  type FeedEntry,
  type FeedLine,
  type LineInput,
} from "@/lib/takeout";
import type {
  AppRepository,
  CampusInfo,
  CommunitySnapshot,
  CompletePickupResult,
  CountCheckView,
  CreateOfferInput,
  CreateRequestInput,
  EditProductInput,
  EditProductResult,
  IntakeInput,
  IntakeResult,
  InventoryRow,
  RecordOutInput,
  RecordOutResult,
  StudentTakeoutInput,
  StudentTakeoutResult,
} from "./app-types";
import type { BatchRec, CampusRec, LedgerRec, OfferRec, PickupRec, ProductRec, Store } from "./store";

const tz = () => process.env.CAMPUS_TZ ?? "America/New_York";
const FEED_KINDS = new Set(["takeout", "removal", "fix"]);

interface Snapshot {
  products: ProductRec[];
  batches: BatchRec[];
  ledger: LedgerRec[];
  offers: OfferRec[];
  pickups: PickupRec[];
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

const toBatch = (b: BatchRec): Batch => ({
  id: b.id,
  productKey: b.productId,
  quantity: b.quantity,
  receivedOn: b.receivedOn,
  createdAt: b.createdAt,
  expiresOn: b.expiresOn,
});
const toLedger = (l: LedgerRec): Ledger => ({
  id: l.id,
  productKey: l.productId,
  delta: l.delta,
  kind: l.kind,
  at: l.createdAt,
  createdAt: l.createdAt,
});

const toCampusInfo = (c: CampusRec): CampusInfo => ({
  id: c.id,
  name: c.name,
  region: c.region,
  miles: c.miles,
  live: c.live,
  studentToken: c.studentToken,
});

/** Units already promised to Community at `campusId`: open offers + pending pickups. */
function reservedMap(campusId: string, offers: OfferRec[], pickups: PickupRec[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of offers) {
    if (o.campusId === campusId && o.status === "open" && o.productId) {
      out.set(o.productId, (out.get(o.productId) ?? 0) + o.qty);
    }
  }
  for (const p of pickups) {
    if (p.fromCampus === campusId && p.status === "pending" && p.productId) {
      out.set(p.productId, (out.get(p.productId) ?? 0) + p.qty);
    }
  }
  return out;
}

export class AppService implements AppRepository {
  constructor(protected readonly store: Store) {}

  get name(): "memory" | "supabase" {
    return this.store.name;
  }

  // ---------------------------------------------------------------- campuses
  async listCampuses() {
    const all = await this.store.listCampuses();
    return all
      .filter((c) => c.live)
      .sort((a, b) => a.miles - b.miles)
      .map(({ id, name, region, miles, live }) => ({ id, name, region, miles, live }));
  }

  async getCampus(campusId: string) {
    const c = (await this.store.listCampuses()).find((x) => x.id === campusId);
    return c ? toCampusInfo(c) : null;
  }

  async getCampusByToken(token: string) {
    if (!token) return null;
    const c = (await this.store.listCampuses()).find((x) => x.studentToken === token);
    return c ? toCampusInfo(c) : null;
  }

  // --------------------------------------------------------------- inventory
  protected async snapshot(campusId: string): Promise<Snapshot> {
    const [products, batches, ledger, offers, pickups] = await Promise.all([
      this.store.listProducts(campusId),
      this.store.listBatches(campusId),
      this.store.listLedger(campusId),
      this.store.listOffers(),
      this.store.listPickups(),
    ]);
    return { products, batches, ledger, offers, pickups };
  }

  protected rowsFrom(campusId: string, todayIso: string, snap: Snapshot): InventoryRow[] {
    const batchesBy = groupBy(snap.batches, (b) => b.productId);
    const ledgerBy = groupBy(snap.ledger, (l) => l.productId);
    const reserved = reservedMap(campusId, snap.offers, snap.pickups);
    return snap.products.map((p) => {
      const batches = (batchesBy.get(p.id) ?? []).map(toBatch);
      const ledger = (ledgerBy.get(p.id) ?? []).map(toLedger);
      const onShelf = deriveOnShelf(batches, ledger);
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
        reserved: reserved.get(p.id) ?? 0,
        lastRestock,
        lastRestockOn: sorted.length ? sorted[sorted.length - 1].receivedOn : null,
        expiresOn,
        status: statusOf({ onShelf, lastRestock, soonestDate: expiresOn, noExpire: p.noExpire }, todayIso),
      };
    });
  }

  async listInventory(campusId: string, todayIso: string) {
    const rows = this.rowsFrom(campusId, todayIso, await this.snapshot(campusId));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listStudentInventory(campusId: string, todayIso: string) {
    const rows = this.rowsFrom(campusId, todayIso, await this.snapshot(campusId));
    return rows.filter(isStudentVisible).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProduct(campusId: string, productId: string, todayIso: string) {
    const rows = this.rowsFrom(campusId, todayIso, await this.snapshot(campusId));
    return rows.find((r) => r.productId === productId) ?? null;
  }

  async listHistory(campusId: string): Promise<Record<string, HistoryEntry[]>> {
    const [batches, ledger] = await Promise.all([this.store.listBatches(campusId), this.store.listLedger(campusId)]);
    const batchesBy = groupBy(batches, (b) => b.productId);
    const ledgerBy = groupBy(ledger, (l) => l.productId);
    const out: Record<string, HistoryEntry[]> = {};
    for (const id of new Set([...batchesBy.keys(), ...ledgerBy.keys()])) {
      out[id] = historyEntries(batchesBy.get(id) ?? [], ledgerBy.get(id) ?? []);
    }
    return out;
  }

  async editProduct(input: EditProductInput, todayIso: string): Promise<EditProductResult> {
    const { campusId, productId } = input;
    const snap = await this.snapshot(campusId);
    const row = this.rowsFrom(campusId, todayIso, snap).find((r) => r.productId === productId);
    if (!row) return { status: "not_found" };

    const plan = planEdit(row, input.edit);
    if (plan.changed.length === 0) return { status: "unchanged", row };
    // Units promised to Community must stay on the shelf until they're picked up.
    if (plan.delta < 0 && row.onShelf + plan.delta < row.reserved) return { status: "reserved", reserved: row.reserved };

    // A best-by edit applies to the batches that will still have units after the adjustment.
    let dateIds: string[] = [];
    let dateSkipped = false;
    if (plan.expiresOn !== undefined) {
      const batches = snap.batches.filter((b) => b.productId === productId).map(toBatch);
      const ledger = snap.ledger.filter((l) => l.productId === productId).map(toLedger);
      const adjustment: Ledger = { id: "planned", productKey: productId, delta: plan.delta, kind: "recount", at: "", createdAt: "" };
      const remaining = remainingByBatch(batches, plan.delta ? [...ledger, adjustment] : ledger);
      dateIds = batches.filter((b) => (remaining.get(b.id) ?? 0) > 0).map((b) => b.id);
      if (dateIds.length === 0) {
        dateSkipped = true; // nothing on the shelf to put a date on
        plan.changed = plan.changed.filter((c) => c !== BEST_BY_LABEL);
        if (plan.changed.length === 0) return { status: "unchanged", row };
      }
    }

    // Details first: a name + brand clash stops the whole edit before anything is written.
    if (plan.details && (await this.store.updateProduct(productId, plan.details)) === "conflict") {
      return { status: "conflict" };
    }

    const others = plan.changed.filter((c) => c !== ON_SHELF_LABEL);
    const history = [
      ...(plan.delta !== 0 ? [{ delta: plan.delta, reason: EDIT_REASON }] : []),
      // Detail-only edits leave a zero-change history row so the drawer shows them.
      ...(others.length ? [{ delta: 0, reason: `${EDIT_REASON}: ${others.join(", ")}` }] : []),
    ];
    if (history.length) {
      await this.store.insertLedger(
        history.map((h) => ({
          campusId,
          productId,
          delta: h.delta,
          kind: "recount" as const,
          source: "staff" as const,
          reason: h.reason,
          groupId: null,
          idempotencyKey: null,
        })),
      );
    }

    if (dateIds.length) {
      await this.store.updateBatchDates(campusId, dateIds, {
        expiresOn: plan.expiresOn ?? null,
        dateType: plan.expiresOn ? "best_by" : null,
        datePrecision: plan.expiresOn ? "day" : null,
        dateSource: plan.expiresOn ? "typed" : null,
      });
    }

    const updated = await this.getProduct(campusId, productId, todayIso);
    return updated ? { status: "saved", row: updated, changed: plan.changed, dateSkipped } : { status: "not_found" };
  }

  // ------------------------------------------------------------------ intake
  private async stockFor(campusId: string, productId: string) {
    const [batches, ledger] = await Promise.all([this.store.listBatches(campusId), this.store.listLedger(campusId)]);
    const b = batches.filter((x) => x.productId === productId);
    const l = ledger.filter((x) => x.productId === productId);
    return { hadBatches: b.length > 0, onShelf: deriveOnShelf(b.map(toBatch), l.map(toLedger)) };
  }

  private async replayOf(batch: BatchRec): Promise<IntakeResult> {
    const product = (await this.store.listProducts(batch.campusId)).find((p) => p.id === batch.productId);
    if (!product) throw new Error("intake replay: product missing");
    const { onShelf } = await this.stockFor(batch.campusId, product.id);
    return {
      product: { id: product.id, name: product.name, brand: product.brand, unit: product.unit, category: product.category },
      batch: { id: batch.id, quantity: batch.quantity, receivedOn: batch.receivedOn, expiresOn: batch.expiresOn },
      duplicate: true,
      totals: { before: Math.max(0, onShelf - batch.quantity), added: batch.quantity, after: onShelf, firstBatch: false },
    };
  }

  async saveIntake(input: IntakeInput): Promise<IntakeResult> {
    if (input.idempotencyKey) {
      const existing = await this.store.getBatchByKey(input.campusId, input.idempotencyKey);
      if (existing) return this.replayOf(existing);
    }

    // Create or reuse the product by (campus, product_key).
    const product = await this.store.upsertProduct({
      campusId: input.campusId,
      productKey: correctionKey(input.product.name, input.product.brand),
      name: input.product.name,
      brand: input.product.brand,
      sizeText: input.product.sizeText,
      category: input.product.category,
      categoryGroup: input.product.categoryGroup,
      unit: input.product.unit,
      noExpire: input.product.noExpire,
      source: input.product.source,
    });

    const before = await this.stockFor(input.campusId, product.id);
    const { batch, duplicate } = await this.store.insertBatch({
      campusId: input.campusId,
      productId: product.id,
      quantity: input.quantity,
      receivedOn: input.receivedOn,
      expiresOn: input.expiresOn,
      dateType: input.dateType,
      datePrecision: input.datePrecision,
      dateSource: input.dateSource,
      idempotencyKey: input.idempotencyKey,
    });
    if (duplicate) return this.replayOf(batch);

    // Accuracy log; never blocks a save.
    if (input.read) {
      try {
        await this.store.insertIntakeRead({
          batchId: batch.id,
          model: input.read.model,
          readName: input.read.readName,
          readDateRaw: input.read.readDateRaw,
          readExpiresOn: input.read.readExpiresOn,
          nameConfidence: input.read.nameConfidence,
          dateConfidence: input.read.dateConfidence,
          editedFields: input.editedFields,
        });
      } catch (err) {
        console.warn(`[db] intake_reads insert failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const after = await this.stockFor(input.campusId, product.id);
    return {
      product: { id: product.id, name: product.name, brand: product.brand, unit: product.unit, category: product.category },
      batch: { id: batch.id, quantity: batch.quantity, receivedOn: batch.receivedOn, expiresOn: batch.expiresOn },
      duplicate: false,
      totals: { before: before.onShelf, added: input.quantity, after: after.onShelf, firstBatch: !before.hadBatches },
    };
  }

  getCorrection(campusId: string, key: string): Promise<ProductCorrection | null> {
    return this.store.getCorrection(campusId, key);
  }
  saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void> {
    return this.store.saveCorrection(campusId, key, correction);
  }

  // ---------------------------------------------------------------- take-out
  /** What staff can act on: on shelf minus reserved (expired items included, to remove them). */
  private staffAvailable(rows: InventoryRow[]): Map<string, number> {
    return new Map(rows.map((r) => [r.productId, Math.max(0, r.onShelf - r.reserved)]));
  }

  private feedLinesFor(lines: LineInput[], byId: Map<string, InventoryRow>): FeedLine[] {
    return lines.flatMap((l) => {
      const r = byId.get(l.productId);
      return r ? [{ productId: l.productId, name: r.name, category: r.category, qty: l.qty }] : [];
    });
  }

  async recordOut(input: RecordOutInput, todayIso: string): Promise<RecordOutResult> {
    const rows = this.rowsFrom(input.campusId, todayIso, await this.snapshot(input.campusId));
    const byId = new Map(rows.map((r) => [r.productId, r]));
    const lines = clampLines(input.lines, this.staffAvailable(rows));
    if (lines.length === 0) return { status: "empty", groupId: null, offerIds: [], lines: [] };

    // "Moved to Community" reserves stock through offers; it never subtracts it.
    if (input.reason === "moved_to_community") {
      const offerIds: string[] = [];
      const made: LineInput[] = [];
      for (const l of lines) {
        const row = byId.get(l.productId)!;
        if (row.status === "expired") continue; // expired food is not offered
        const offer = await this.store.insertOffer({
          campusId: input.campusId,
          productId: row.productId,
          name: row.name,
          unit: row.unit,
          qty: l.qty,
          category: row.category,
          expiresOn: row.expiresOn,
          noExpire: row.noExpire,
          status: "open",
          note: null,
        });
        offerIds.push(offer.id);
        made.push(l);
      }
      return {
        status: offerIds.length ? "recorded" : "empty",
        groupId: null,
        offerIds,
        lines: this.feedLinesFor(made, byId),
      };
    }

    const groupId = randomUUID();
    const result = await this.store.insertLedger(
      lines.map((l) => ({
        campusId: input.campusId,
        productId: l.productId,
        delta: -l.qty,
        kind: "removal" as const,
        source: "staff" as const,
        reason: input.reason,
        groupId,
        idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:${l.productId}` : null,
      })),
    );
    if (result === "duplicate") return { status: "duplicate", groupId: null, offerIds: [], lines: [] };
    return { status: "recorded", groupId, offerIds: [], lines: this.feedLinesFor(lines, byId) };
  }

  async studentTakeout(input: StudentTakeoutInput, todayIso: string, nowMs: number = Date.now()): Promise<StudentTakeoutResult> {
    const { campusId, deviceId, submissionId } = input;
    const prefix = `student:${submissionId}:`;
    const snap = await this.snapshot(campusId);
    const rows = this.rowsFrom(campusId, todayIso, snap);
    const byId = new Map(rows.map((r) => [r.productId, r]));
    const named = (lines: LineInput[]) =>
      lines.flatMap((l) => {
        const r = byId.get(l.productId);
        return r ? [{ productId: l.productId, name: r.name, qty: l.qty }] : [];
      });

    // A retry of a submission we already applied or held gets the same answer.
    const applied = snap.ledger.filter((l) => l.idempotencyKey?.startsWith(prefix));
    if (applied.length > 0) {
      return { status: "recorded", lines: named(applied.map((l) => ({ productId: l.productId, qty: -l.delta }))) };
    }
    const heldAlready = await this.store.findHeldBySubmission(campusId, submissionId);
    if (heldAlready) return { status: "held", lines: named(heldAlready.lines) };

    // Re-cap on the server: hidden (expired / empty / reserved) items can't be taken.
    const available = new Map(rows.filter(isStudentVisible).map((r) => [r.productId, studentAvailable(r)]));
    const lines = clampLines(input.lines, available);
    if (lines.length === 0) return { status: "empty", lines: [] };

    const last = await this.store.lastStudentSubmissionAt(campusId, deviceId);
    if (isRepeatSubmission(last, nowMs)) {
      await this.store.insertHeld({ campusId, deviceId, submissionId, lines });
      return { status: "held", lines: named(lines) };
    }

    const groupId = randomUUID();
    const result = await this.store.insertLedger(
      lines.map((l) => ({
        campusId,
        productId: l.productId,
        delta: -l.qty,
        kind: "takeout" as const,
        source: "student" as const,
        reason: null,
        groupId,
        idempotencyKey: `${prefix}${l.productId}`,
      })),
    );
    if (result === "inserted") await this.store.recordStudentSubmission(campusId, deviceId, new Date(nowMs).toISOString());
    return { status: "recorded", lines: named(lines) };
  }

  async listFeed(campusId: string, todayIso: string): Promise<FeedEntry[]> {
    const [products, ledger, held] = await Promise.all([
      this.store.listProducts(campusId),
      this.store.listLedger(campusId),
      this.store.listHeld(campusId),
    ]);
    return buildFeed({
      ledger,
      products: new Map(products.map((p) => [p.id, { name: p.name, category: p.category }])),
      held,
      todayIso,
      tz: tz(),
    });
  }

  /** Net quantity per product for one feed group, from its ledger rows. */
  private groupLines(rows: LedgerRec[], byId: Map<string, InventoryRow>): FeedLine[] {
    const net = new Map<string, number>();
    for (const r of rows) net.set(r.productId, (net.get(r.productId) ?? 0) - r.delta);
    return [...net.entries()].flatMap(([productId, qty]) => {
      const r = byId.get(productId);
      return r && qty > 0 ? [{ productId, name: r.name, category: r.category, qty }] : [];
    });
  }

  private async applyFix(
    campusId: string,
    groupId: string,
    todayIso: string,
    want: (current: FeedLine[]) => LineInput[],
  ): Promise<boolean> {
    const snap = await this.snapshot(campusId);
    const rows = this.rowsFrom(campusId, todayIso, snap);
    const byId = new Map(rows.map((r) => [r.productId, r]));
    const groupRows = snap.ledger.filter((l) => l.groupId === groupId && l.source !== "system" && FEED_KINDS.has(l.kind));
    if (groupRows.length === 0) return false;
    const current = this.groupLines(groupRows, byId);
    const changes = planFix(current, want(current), this.staffAvailable(rows));
    if (changes.length === 0) return true;
    const first = groupRows.find((r) => r.kind !== "fix") ?? groupRows[0];
    await this.store.insertLedger(
      changes.map((c) => ({
        campusId,
        productId: c.productId,
        delta: c.delta,
        kind: "fix" as const,
        source: first.source,
        reason: first.reason,
        groupId,
        idempotencyKey: null,
      })),
    );
    return true;
  }

  fixEntry(campusId: string, groupId: string, lines: LineInput[], todayIso: string) {
    return this.applyFix(campusId, groupId, todayIso, () => lines);
  }

  deleteEntry(campusId: string, groupId: string, todayIso: string) {
    return this.applyFix(campusId, groupId, todayIso, (current) => current.map((l) => ({ productId: l.productId, qty: 0 })));
  }

  async undoEntry(campusId: string, groupId: string | null, offerIds: string[], nowMs: number = Date.now()): Promise<boolean> {
    const recent = (iso: string) => nowMs - Date.parse(iso) <= UNDO_SERVER_WINDOW_MS;
    let did = false;
    if (groupId) {
      const rows = (await this.store.listLedger(campusId)).filter((l) => l.groupId === groupId);
      // Only a just-recorded STAFF entry can be undone; this is not a way to erase history.
      if (rows.length > 0 && rows.every((r) => r.source === "staff" && recent(r.createdAt))) {
        await this.store.deleteLedgerGroup(campusId, groupId);
        did = true;
      }
    }
    if (offerIds.length > 0) {
      const offers = await this.store.listOffers();
      for (const id of offerIds) {
        const o = offers.find((x) => x.id === id && x.campusId === campusId && x.status === "open");
        if (o && recent(o.createdAt)) {
          await this.store.updateOffer(id, { status: "withdrawn" });
          did = true;
        }
      }
    }
    return did;
  }

  async resolveHeld(campusId: string, heldId: string, accept: boolean, todayIso: string): Promise<boolean> {
    const held = (await this.store.listHeld(campusId)).find((h) => h.id === heldId && h.status === "held");
    if (!held) return false;
    if (!accept) {
      await this.store.setHeldStatus(heldId, "discarded");
      return true;
    }
    const rows = this.rowsFrom(campusId, todayIso, await this.snapshot(campusId));
    const available = new Map(rows.filter(isStudentVisible).map((r) => [r.productId, studentAvailable(r)]));
    const lines = clampLines(held.lines, available);
    if (lines.length > 0) {
      const groupId = randomUUID();
      await this.store.insertLedger(
        lines.map((l) => ({
          campusId,
          productId: l.productId,
          delta: -l.qty,
          kind: "takeout" as const,
          source: "student" as const,
          reason: null,
          groupId,
          idempotencyKey: `held:${heldId}:${l.productId}`,
        })),
      );
    }
    await this.store.setHeldStatus(heldId, "accepted");
    return true;
  }

  async listCountChecks(campusId: string, todayIso: string): Promise<CountCheckView[]> {
    const [checks, snap] = await Promise.all([this.store.listCountChecks(campusId), this.snapshot(campusId)]);
    const byId = new Map(this.rowsFrom(campusId, todayIso, snap).map((r) => [r.productId, r]));
    return checks.flatMap((c) => {
      const r = byId.get(c.productId);
      if (c.status !== "open" || !r || r.onShelf === c.counted) return [];
      return [{ id: c.id, productId: c.productId, name: r.name, unit: r.unit, category: r.category, counted: c.counted, system: r.onShelf }];
    });
  }

  async resolveCountCheck(campusId: string, checkId: string, useCounted: boolean, todayIso: string): Promise<boolean> {
    const check = (await this.store.listCountChecks(campusId)).find((c) => c.id === checkId && c.status === "open");
    if (!check) return false;
    if (!useCounted) {
      await this.store.setCountCheckStatus(checkId, "dismissed");
      return true;
    }
    const row = await this.getProduct(campusId, check.productId, todayIso);
    if (row && row.onShelf !== check.counted) {
      // A recount adjusts by the difference; it never overwrites a stored number.
      await this.store.insertLedger([
        {
          campusId,
          productId: check.productId,
          delta: check.counted - row.onShelf,
          kind: "recount",
          source: "staff",
          reason: "recount",
          groupId: null,
          idempotencyKey: `recount:${checkId}`,
        },
      ]);
    }
    await this.store.setCountCheckStatus(checkId, "resolved");
    return true;
  }

  // --------------------------------------------------- offers that reserve stock
  async createOffer(input: CreateOfferInput, todayIso: string) {
    const rows = this.rowsFrom(input.campusId, todayIso, await this.snapshot(input.campusId));
    const row = rows.find((r) => r.productId === input.productId);
    if (!row || row.status === "expired") return null;
    const qty = Math.min(Math.max(1, Math.round(input.qty)), Math.max(0, row.onShelf - row.reserved));
    if (qty < 1) return null;
    const offer = await this.store.insertOffer({
      campusId: input.campusId,
      productId: row.productId,
      name: row.name,
      unit: row.unit,
      qty,
      category: row.category,
      expiresOn: row.expiresOn,
      noExpire: row.noExpire,
      status: "open",
      note: input.note?.trim() || null,
    });
    if (input.requestId) await this.store.setRequestOffered(input.requestId, qty);
    return { offerId: offer.id, qty };
  }

  async withdrawOffer(campusId: string, offerId: string): Promise<boolean> {
    const o = (await this.store.listOffers()).find((x) => x.id === offerId && x.campusId === campusId && x.status === "open");
    if (!o) return false;
    await this.store.updateOffer(offerId, { status: "withdrawn" });
    return true;
  }

  // --------------------------------------------------------------- community
  async listCommunity(campusId: string, todayIso: string): Promise<CommunitySnapshot> {
    const snap = await this.snapshot(campusId);
    const requests = await this.store.listRequests();
    return {
      rows: this.rowsFrom(campusId, todayIso, snap).sort((a, b) => a.name.localeCompare(b.name)),
      offers: snap.offers,
      requests,
      pickups: snap.pickups,
    };
  }

  async createRequest(input: CreateRequestInput) {
    const name = input.name.trim().slice(0, 80);
    const qty = Math.round(input.qty);
    if (!name || !Number.isFinite(qty) || qty < 1 || qty > 999) return null;
    const r = await this.store.insertRequest({
      campusId: input.campusId,
      name,
      category: normalizeCategory(input.category),
      qty,
      offered: null,
    });
    return { requestId: r.id };
  }

  async claimOffer(campusId: string, offerId: string, qty: number) {
    const offer = (await this.store.listOffers()).find((o) => o.id === offerId);
    if (!offer || offer.status !== "open" || offer.campusId === campusId || offer.qty < 1) return null;
    const n = Math.min(Math.max(1, Math.round(qty)), offer.qty, 999);
    if (!Number.isFinite(n) || n < 1) return null;
    const remaining = offer.qty - n;
    // Guarded update: if someone else claimed in the meantime, nothing changes.
    const ok = await this.store.updateOfferQtyIf(offer.id, offer.qty, remaining, remaining === 0 ? "claimed" : "open");
    if (!ok) return null;
    const pickup = await this.store.insertPickup({
      offerId: offer.id,
      productId: offer.productId,
      fromCampus: offer.campusId,
      toCampus: campusId,
      name: offer.name,
      unit: offer.unit,
      qty: n,
      category: offer.category,
      expiresOn: offer.expiresOn,
      noExpire: offer.noExpire,
      status: "pending",
    });
    return { pickupId: pickup.id, qty: n };
  }

  async completePickup(campusId: string, pickupId: string, todayIso: string): Promise<CompletePickupResult | null> {
    const pickup = (await this.store.listPickups()).find((p) => p.id === pickupId && p.toCampus === campusId);
    if (!pickup) return null;

    // The offering campus's product (null for sample campuses with no inventory).
    const source = pickup.productId
      ? (await this.store.listProducts(pickup.fromCampus)).find((p) => p.id === pickup.productId) ?? null
      : null;

    // 1) Leave the offering campus exactly once (idempotent by key).
    const outKey = `pickup:${pickup.id}:out`;
    let moved = pickup.qty;
    if (source) {
      const existing = (await this.store.listLedger(pickup.fromCampus)).find((l) => l.idempotencyKey === outKey);
      if (existing) {
        moved = -existing.delta;
      } else {
        // Never move more than is physically there (keeps the two sides equal).
        moved = Math.min(pickup.qty, (await this.stockFor(pickup.fromCampus, source.id)).onShelf);
        if (moved > 0) {
          await this.store.insertLedger([
            {
              campusId: pickup.fromCampus,
              productId: source.id,
              delta: -moved,
              kind: "community_out",
              source: "staff",
              reason: "community_pickup",
              groupId: null,
              idempotencyKey: outKey,
            },
          ]);
        }
      }
    }

    // 2) Arrive at the claiming campus as an intake batch (idempotent by key).
    const product = await this.store.upsertProduct({
      campusId,
      productKey: correctionKey(source?.name ?? pickup.name, source?.brand ?? null),
      name: source?.name ?? pickup.name,
      brand: source?.brand ?? null,
      sizeText: source?.sizeText ?? null,
      category: source?.category ?? pickup.category,
      categoryGroup: source?.categoryGroup ?? categoryGroup(pickup.category),
      unit: source?.unit ?? pickup.unit,
      noExpire: source?.noExpire ?? pickup.noExpire,
      source: "donated",
    });
    const before = await this.stockFor(campusId, product.id);
    let duplicate = pickup.status === "completed";
    if (moved > 0) {
      const { duplicate: dup } = await this.store.insertBatch({
        campusId,
        productId: product.id,
        quantity: moved,
        receivedOn: todayIso,
        expiresOn: pickup.noExpire ? null : pickup.expiresOn,
        dateType: pickup.expiresOn ? "best_by" : null,
        datePrecision: pickup.expiresOn ? "day" : null,
        dateSource: "imported",
        idempotencyKey: `pickup:${pickup.id}:in`,
      });
      duplicate = duplicate || dup;
    }

    // 3) Release the reservation.
    if (pickup.status !== "completed") await this.store.markPickupCompleted(pickup.id);

    const after = await this.stockFor(campusId, product.id);
    return {
      moved,
      duplicate,
      product: { id: product.id, name: product.name, unit: product.unit, category: product.category },
      before: duplicate ? Math.max(0, after.onShelf - moved) : before.onShelf,
      after: after.onShelf,
    };
  }
}
