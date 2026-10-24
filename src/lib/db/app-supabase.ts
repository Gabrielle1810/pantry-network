// Supabase app read repository (Step 1). SERVER-ONLY. Queries products,
// item_batches, ledger_entries, and open offers, then derives on-shelf +
// reserved + status with the same pure functions as the memory repo, so the two
// behave identically. Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY only.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { categoryGroup } from "@/lib/items/taxonomy";
import { deriveOnShelf, lastRestockAmount, soonestExpiry, sortFIFO, type Batch, type Ledger } from "@/lib/stock";
import { statusOf } from "@/lib/status";
import type { AppReadRepository, InventoryRow } from "./app-types";

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
  status: string;
}

export class SupabaseAppRepository implements AppReadRepository {
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
      .eq("live", true);
    if (error) throw new Error(`supabase listCampuses: ${error.message}`);
    return (data ?? []) as { id: string; name: string; region: string; miles: number; live: boolean }[];
  }

  private async rowsFor(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    const [{ data: products, error: pe }, { data: batches, error: be }, { data: ledger, error: le }, { data: offers, error: oe }] =
      await Promise.all([
        this.client.from("products").select("*").eq("campus_id", campusId),
        this.client.from("item_batches").select("id, product_id, quantity, received_on, created_at, expires_on").eq("campus_id", campusId),
        this.client.from("ledger_entries").select("id, product_id, delta, kind, created_at").eq("campus_id", campusId),
        this.client.from("offers").select("product_id, qty, status").eq("campus_id", campusId).eq("status", "open"),
      ]);
    if (pe) throw new Error(`supabase products: ${pe.message}`);
    if (be) throw new Error(`supabase batches: ${be.message}`);
    if (le) throw new Error(`supabase ledger: ${le.message}`);
    if (oe) throw new Error(`supabase offers: ${oe.message}`);

    const reserved = new Map<string, number>();
    for (const o of (offers ?? []) as OfferRow[]) {
      if (o.product_id) reserved.set(o.product_id, (reserved.get(o.product_id) ?? 0) + o.qty);
    }

    return ((products ?? []) as ProductRow[]).map((p) => {
      const pb: Batch[] = ((batches ?? []) as BatchRow[])
        .filter((b) => b.product_id === p.id)
        .map((b) => ({
          id: b.id,
          productKey: p.id,
          quantity: b.quantity,
          receivedOn: b.received_on,
          createdAt: b.created_at,
          expiresOn: b.expires_on,
        }));
      const pl: Ledger[] = ((ledger ?? []) as LedgerRow[])
        .filter((l) => l.product_id === p.id)
        .map((l) => ({ id: l.id, productKey: p.id, delta: l.delta, kind: l.kind, at: l.created_at, createdAt: l.created_at }));
      const onShelf = deriveOnShelf(pb, pl);
      const lastRestock = lastRestockAmount(pb);
      const expiresOn = soonestExpiry(pb);
      const sorted = sortFIFO(pb);
      const status = statusOf({ onShelf, lastRestock, soonestDate: expiresOn, noExpire: p.no_expire }, todayIso);
      return {
        productId: p.id,
        campusId,
        productKey: p.product_key,
        name: p.name,
        brand: p.brand,
        unit: p.unit,
        category: p.category,
        categoryGroup: p.category_group ?? categoryGroup(p.category),
        source: p.source,
        noExpire: p.no_expire,
        onShelf,
        reserved: reserved.get(p.id) ?? 0,
        lastRestock,
        lastRestockOn: sorted.length ? sorted[sorted.length - 1].receivedOn : null,
        expiresOn,
        status,
      };
    });
  }

  async listInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return (await this.rowsFor(campusId, todayIso)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listStudentInventory(campusId: string, todayIso: string): Promise<InventoryRow[]> {
    return (await this.rowsFor(campusId, todayIso))
      .filter((r) => r.onShelf - r.reserved > 0 && r.status !== "expired")
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
