// Supabase repository (UI13.5, R13.3/R13.4). SERVER-ONLY. Uses SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY — never the NEXT_PUBLIC_* or publishable/anon keys,
// which must not perform writes (the service-role key bypasses RLS, which is the
// correct MVP setup until per-user policies arrive with accounts).
//
// Verified against current supabase-js v2 docs: a server client is created with
// createClient(url, serviceRoleKey, { auth: { persistSession: false,
// autoRefreshToken: false } }). Idempotency is driven by the partial unique
// index items_campus_idempotency_key: on a 23505 conflict we return the existing
// row and skip the paired intake_reads insert.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ItemBatch } from "@/lib/items/schema";
import type { ProductCorrection } from "@/lib/corrections";
import type { ItemRepository, SaveBatchInput } from "./types";

const UNIQUE_VIOLATION = "23505";

interface ItemRow {
  id: string;
  campus_id: string;
  idempotency_key: string | null;
  name: string;
  brand: string | null;
  size_text: string | null;
  category: string;
  category_group: string | null;
  quantity: number;
  unit: string;
  received_on: string;
  expires_on: string | null;
  date_type: string | null;
  date_precision: string | null;
  date_source: string | null;
  dont_track: boolean;
  doesnt_expire: boolean;
  perishable: boolean;
  arrived_expired: boolean;
  source: string | null;
  edited_fields: string[] | null;
  created_at: string;
}

function rowToBatch(row: ItemRow): ItemBatch {
  return {
    id: row.id,
    campus_id: row.campus_id,
    idempotency_key: row.idempotency_key,
    name: row.name,
    brand: row.brand,
    size_text: row.size_text,
    category: row.category,
    category_group: row.category_group,
    quantity: row.quantity,
    unit: row.unit,
    received_on: row.received_on,
    expires_on: row.expires_on,
    date_type: row.date_type,
    date_precision: row.date_precision,
    date_source: row.date_source,
    dont_track: row.dont_track,
    doesnt_expire: row.doesnt_expire,
    perishable: row.perishable,
    arrived_expired: row.arrived_expired,
    source: row.source,
    edited_fields: row.edited_fields ?? [],
    created_at: row.created_at,
  };
}

export class SupabaseRepository implements ItemRepository {
  readonly name = "supabase" as const;
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async saveBatch(input: SaveBatchInput): Promise<ItemBatch> {
    const insert = {
      campus_id: input.campusId,
      idempotency_key: input.idempotencyKey,
      name: input.batch.name,
      brand: input.batch.brand,
      size_text: input.batch.size_text,
      category: input.batch.category,
      category_group: input.batch.category_group,
      quantity: input.batch.quantity,
      unit: input.batch.unit,
      received_on: input.receivedOn,
      expires_on: input.batch.expires_on,
      date_type: input.batch.date_type,
      date_precision: input.batch.date_precision,
      date_source: input.batch.date_source,
      dont_track: input.batch.dont_track,
      doesnt_expire: input.batch.doesnt_expire,
      perishable: input.batch.perishable,
      arrived_expired: input.arrivedExpired,
      source: input.batch.source,
      edited_fields: input.editedFields,
    };

    const { data, error } = await this.client
      .from("items")
      .insert(insert)
      .select()
      .single();

    if (error) {
      // Duplicate idempotency key → return the existing row, skip intake_reads (UI13.3).
      if (error.code === UNIQUE_VIOLATION && input.idempotencyKey) {
        const existing = await this.findByIdempotencyKey(input.campusId, input.idempotencyKey);
        if (existing) return existing;
      }
      throw new Error(`supabase insert items failed: ${error.message}`);
    }

    const batch = rowToBatch(data as ItemRow);

    // Paired intake_reads row (accuracy measurement). Non-fatal if it fails.
    if (input.read) {
      const { error: readErr } = await this.client.from("intake_reads").insert({
        item_id: batch.id,
        model: input.read.model,
        read_name: input.read.read_name,
        read_date_raw: input.read.read_date_raw,
        read_expires_on: input.read.read_expires_on,
        name_confidence: input.read.name_confidence,
        date_confidence: input.read.date_confidence,
        edited_fields: input.editedFields,
      });
      if (readErr) {
        console.warn(`[db] intake_reads insert failed (non-fatal): ${readErr.message}`);
      }
    }

    return batch;
  }

  private async findByIdempotencyKey(
    campusId: string,
    key: string,
  ): Promise<ItemBatch | null> {
    const { data, error } = await this.client
      .from("items")
      .select()
      .eq("campus_id", campusId)
      .eq("idempotency_key", key)
      .single();
    if (error || !data) return null;
    return rowToBatch(data as ItemRow);
  }

  async listBatches(
    campusId: string,
    since: "today" | string,
    todayIso: string,
  ): Promise<ItemBatch[]> {
    const floor = since === "today" ? todayIso : since;
    const { data, error } = await this.client
      .from("items")
      .select()
      .eq("campus_id", campusId)
      .gte("received_on", floor)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`supabase listBatches failed: ${error.message}`);
    return (data as ItemRow[]).map(rowToBatch);
  }

  async getCorrection(campusId: string, key: string): Promise<ProductCorrection | null> {
    const { data, error } = await this.client
      .from("product_corrections")
      .select("corrected_name, corrected_brand, corrected_category")
      .eq("campus_id", campusId)
      .eq("read_key", key)
      .single();
    if (error || !data) return null;
    return {
      name: data.corrected_name ?? null,
      brand: data.corrected_brand ?? null,
      category: data.corrected_category ?? null,
    };
  }

  async saveCorrection(
    campusId: string,
    key: string,
    correction: ProductCorrection,
  ): Promise<void> {
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
    if (error) throw new Error(`supabase saveCorrection failed: ${error.message}`);
  }
}
