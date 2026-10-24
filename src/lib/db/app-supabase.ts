// Supabase app repository. SERVER-ONLY: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
// never the NEXT_PUBLIC_*/anon keys. Reads derive on-shelf + reserved + status
// with the same pure functions as the memory repo. Saves create or reuse a
// product by (campus_id, product_key) and insert one item_batch; the partial
// unique index on (campus_id, idempotency_key) makes a repeat save a no-op.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
import type { AppRepository, IntakeInput, IntakeResult, InventoryRow } from "./app-types";

const UNIQUE_VIOLATION = "23505";

interface ProductRow {
  id: string;
  campus_id: string;
  product_key: string;
  name: string;
  brand: string | null;
  size_text: string | null;
  category: string;
  category_group: string | null;
  unit: string;
  no_expire: boolean;
  source: "donated" | "purchased" | null;
}
interface BatchRow {
  id: string;
  product_id: string;
  quantity: number;
  received_on: string;
  created_at: string;
  expires_on: string | null;
}
interface LedgerRow {
  id: string;
  product_id: string;
  delta: number;
  kind: Ledger["kind"];
  created_at: string;
}
interface OfferRow {
  product_id: string | null;
  qty: number;
}

const BATCH_COLS = "id, product_id, quantity, received_on, created_at, expires_on";
const LEDGER_COLS = "id, product_id, delta, kind, created_at";

function toBatch(b: BatchRow): Batch {
  return {
    id: b.id,
    productKey: b.product_id,
    quantity: b.quantity,
    receivedOn: b.received_on,
    createdAt: b.created_at,
    expiresOn: b.expires_on,
  };
}
function toLedger(l: LedgerRow): Ledger {
  return { id: l.id, productKey: l.product_id, delta: l.delta, kind: l.kind, at: l.created_at, createdAt: l.created_at };
}

export class SupabaseAppRepository implements AppRepository {
  readonly name = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listCampuses() {
    const { data, error } = await this.client
      .from("campuses")
      .select("id, name, region, miles, live")
      .eq("live", true)
      .order("miles");
    if (error) throw new Error(`supabase listCampuses: ${error.message}`);
    return (data ?? []) as { id: string; name: string; region: string; miles: number; live: boolean }[];
  }

  private toRow(p: ProductRow, batches: Batch[], ledger: Ledger[], reserved: number, todayIso: string): InventoryRow {
    const onShelf = deriveOnShelf(batches, ledger);
    const lastRestock = lastRestockAmount(batches);
    const expiresOn = activeSoonestExpiry(batches, ledger);
    const sorted = sortFIFO(batches);
    return {
      productId: p.id,
      campusId: p.campus_id,
      productKey: p.product_key,
      name: p.name,
      brand: p.brand,
      unit: p.unit,
      category: p.category,
      categoryGroup: p.category_group ?? categoryGroup(p.category),
      source: p.source,
      noExpire: p.no_expire,
      onShelf,
      reserved,
      lastRestock,
      lastRestockOn: sorted.length ? sorted[sorted.length - 1].receivedOn : null,
      expiresOn,
      status: statusOf({ onShelf, lastRestock, soonestDate: expiresOn, noExpire: p.no_expire }, todayIso),
    };
  }

  private async rowsFor(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    const [products, batches, ledger, offers] = await Promise.all([
      this.client.from("products").select("*").eq("campus_id", campusId),
      this.client.from("item_batches").select(BATCH_COLS).eq("campus_id", campusId),
      this.client.from("ledger_entries").select(LEDGER_COLS).eq("campus_id", campusId),
      this.client.from("offers").select("product_id, qty").eq("campus_id", campusId).eq("status", "open"),
    ]);
    for (const [label, r] of [["products", products], ["batches", batches], ["ledger", ledger], ["offers", offers]] as const) {
      if (r.error) throw new Error(`supabase ${label}: ${r.error.message}`);
    }

    const reserved = new Map<string, number>();
    for (const o of (offers.data ?? []) as OfferRow[]) {
      if (o.product_id) reserved.set(o.product_id, (reserved.get(o.product_id) ?? 0) + o.qty);
    }
    const allBatches = ((batches.data ?? []) as BatchRow[]).map(toBatch);
    const allLedger = ((ledger.data ?? []) as LedgerRow[]).map(toLedger);

    return ((products.data ?? []) as ProductRow[]).map((p) =>
      this.toRow(
        p,
        allBatches.filter((b) => b.productKey === p.id),
        allLedger.filter((l) => l.productKey === p.id),
        reserved.get(p.id) ?? 0,
        todayIso,
      ),
    );
  }

  async listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return (await this.rowsFor(campusId, todayIso)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return (await this.rowsFor(campusId, todayIso))
      .filter((r) => r.onShelf - r.reserved > 0 && r.status !== "expired")
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getProduct(campusId: string, productId: string, todayIso: string): Promise<InventoryRow | null> {
    const rows = await this.rowsFor(campusId, todayIso);
    return rows.find((r) => r.productId === productId) ?? null;
  }

  /** Batches + ledger for one product. */
  private async stockOf(productId: string) {
    const [b, l] = await Promise.all([
      this.client.from("item_batches").select(BATCH_COLS).eq("product_id", productId),
      this.client.from("ledger_entries").select(LEDGER_COLS).eq("product_id", productId),
    ]);
    if (b.error) throw new Error(`supabase batches: ${b.error.message}`);
    if (l.error) throw new Error(`supabase ledger: ${l.error.message}`);
    const batches = ((b.data ?? []) as BatchRow[]).map(toBatch);
    const ledger = ((l.data ?? []) as LedgerRow[]).map(toLedger);
    return { batches, onShelf: deriveOnShelf(batches, ledger) };
  }

  private async findProduct(campusId: string, productKey: string): Promise<ProductRow | null> {
    const { data, error } = await this.client
      .from("products")
      .select("*")
      .eq("campus_id", campusId)
      .eq("product_key", productKey)
      .maybeSingle();
    if (error) throw new Error(`supabase product lookup: ${error.message}`);
    return (data as ProductRow | null) ?? null;
  }

  private productOut(p: ProductRow): IntakeResult["product"] {
    return { id: p.id, name: p.name, brand: p.brand, unit: p.unit, category: p.category };
  }

  async saveIntake(input: IntakeInput): Promise<IntakeResult> {
    const productKey = correctionKey(input.product.name, input.product.brand);

    // Create or reuse the product by (campus_id, product_key).
    let product = await this.findProduct(input.campusId, productKey);
    if (!product) {
      const { data, error } = await this.client
        .from("products")
        .insert({
          campus_id: input.campusId,
          product_key: productKey,
          name: input.product.name,
          brand: input.product.brand,
          size_text: input.product.sizeText,
          category: input.product.category,
          category_group: input.product.categoryGroup,
          unit: input.product.unit,
          no_expire: input.product.noExpire,
          source: input.product.source,
        })
        .select("*")
        .single();
      if (error && error.code !== UNIQUE_VIOLATION) throw new Error(`supabase insert product: ${error.message}`);
      product = error ? await this.findProduct(input.campusId, productKey) : (data as ProductRow);
    }
    if (!product) throw new Error("supabase: product missing after insert");

    const before = await this.stockOf(product.id);

    const { data: inserted, error: be } = await this.client
      .from("item_batches")
      .insert({
        campus_id: input.campusId,
        product_id: product.id,
        quantity: input.quantity,
        received_on: input.receivedOn,
        expires_on: input.expiresOn,
        date_type: input.dateType,
        date_precision: input.datePrecision,
        date_source: input.dateSource,
        idempotency_key: input.idempotencyKey,
      })
      .select("id")
      .single();

    if (be) {
      if (be.code === UNIQUE_VIOLATION && input.idempotencyKey) return this.replay(input.campusId, input.idempotencyKey);
      throw new Error(`supabase insert batch: ${be.message}`);
    }

    const batchId = (inserted as { id: string }).id;

    // Accuracy log (intake_reads.batch_id comes from 003). Never blocks a save.
    if (input.read) {
      const { error: re } = await this.client.from("intake_reads").insert({
        batch_id: batchId,
        model: input.read.model,
        read_name: input.read.readName,
        read_date_raw: input.read.readDateRaw,
        read_expires_on: input.read.readExpiresOn,
        name_confidence: input.read.nameConfidence,
        date_confidence: input.read.dateConfidence,
        edited_fields: input.editedFields,
      });
      if (re) console.warn(`[db] intake_reads insert failed (non-fatal): ${re.message}`);
    }

    return {
      product: this.productOut(product),
      batch: { id: batchId, quantity: input.quantity, receivedOn: input.receivedOn, expiresOn: input.expiresOn },
      duplicate: false,
      totals: {
        before: before.onShelf,
        added: input.quantity,
        after: before.onShelf + input.quantity,
        firstBatch: before.batches.length === 0,
      },
    };
  }

  /** A repeat idempotency key: return the batch it already saved. */
  private async replay(campusId: string, key: string): Promise<IntakeResult> {
    const { data, error } = await this.client
      .from("item_batches")
      .select("id, product_id, quantity, received_on, expires_on")
      .eq("campus_id", campusId)
      .eq("idempotency_key", key)
      .single();
    if (error || !data) throw new Error(`supabase replay: ${error?.message ?? "not found"}`);
    const { data: p, error: pe } = await this.client.from("products").select("*").eq("id", data.product_id).single();
    if (pe || !p) throw new Error(`supabase replay product: ${pe?.message ?? "not found"}`);
    const now = await this.stockOf(data.product_id);
    return {
      product: this.productOut(p as ProductRow),
      batch: { id: data.id, quantity: data.quantity, receivedOn: data.received_on, expiresOn: data.expires_on },
      duplicate: true,
      totals: { before: Math.max(0, now.onShelf - data.quantity), added: data.quantity, after: now.onShelf, firstBatch: false },
    };
  }

  async getCorrection(campusId: string, key: string): Promise<ProductCorrection | null> {
    const { data, error } = await this.client
      .from("product_corrections")
      .select("corrected_name, corrected_brand, corrected_category")
      .eq("campus_id", campusId)
      .eq("read_key", key)
      .maybeSingle();
    if (error || !data) return null;
    return {
      name: data.corrected_name ?? null,
      brand: data.corrected_brand ?? null,
      category: data.corrected_category ?? null,
    };
  }

  async saveCorrection(campusId: string, key: string, correction: ProductCorrection): Promise<void> {
    // product_corrections.(campus_id, read_key) is a full unique constraint, so
    // upsert works here (unlike the partial idempotency indexes).
    const { error } = await this.client.from("product_corrections").upsert(
      {
        campus_id: campusId,
        read_key: key,
        corrected_name: correction.name,
        corrected_brand: correction.brand,
        corrected_category: correction.category,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campus_id,read_key" },
    );
    if (error) throw new Error(`supabase saveCorrection: ${error.message}`);
  }
}
