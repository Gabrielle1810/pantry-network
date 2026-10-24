// Idempotent Supabase seeding (Step 2). Writes the sample data — two live
// campuses (harbor full, cedar smaller), the four Community-only campuses, and
// their offers/requests — into Supabase. SERVER-ONLY (service-role key).
//
// Idempotency (so running twice duplicates nothing, and Settings "Reset demo
// data" can reuse it):
//  * campuses: upsert by id. student_token is generated with crypto ONLY when
//    the campus has none yet, so re-seeding never rotates a live token and no
//    token is ever hard-coded in the repo (PI.1).
//  * products: upsert by (campus_id, product_key).
//  * batches/ledger: carry a deterministic `idempotency_key` ("seed:...") so the
//    partial unique indexes make re-inserts no-ops.
//  * offers/requests: deleted-then-reinserted for the seed set so counts stay
//    stable (they belong only to sample campuses).
import { randomUUID, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CAMPUSES } from "@/lib/campus";
import { categoryGroup } from "@/lib/items/taxonomy";
import { correctionKey } from "@/lib/corrections";
import {
  HARBOR_ITEMS,
  CEDAR_ITEMS,
  SEED_OFFERS,
  SEED_REQUESTS,
  isoFromOffset,
  type SeedItemSpec,
} from "./seed";

export interface SeedResult {
  campuses: number;
  products: number;
  batches: number;
  ledger: number;
  offers: number;
  requests: number;
  tokens: Record<string, string>; // campusId → student_token (for the poster URL)
}

function newToken(): string {
  return randomBytes(24).toString("base64url"); // unguessable, URL-safe
}

export async function seedSupabase(url: string, serviceRoleKey: string, todayIso: string): Promise<SeedResult> {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokens: Record<string, string> = {};

  // --- campuses: upsert, preserving any existing student_token ---
  const { data: existing } = await db.from("campuses").select("id, student_token");
  const existingTokens = new Map<string, string>((existing ?? []).map((c) => [c.id, c.student_token]));

  const campusRows = Object.values(CAMPUSES).map((c) => {
    const token = existingTokens.get(c.id) ?? newToken();
    tokens[c.id] = token;
    return {
      id: c.id,
      name: c.name,
      region: c.region,
      miles: c.miles,
      place: c.place ?? null,
      hours: c.hours ?? null,
      contact: c.contact ?? null,
      live: c.live,
      student_token: token,
    };
  });
  const { error: ce } = await db.from("campuses").upsert(campusRows, { onConflict: "id" });
  if (ce) throw new Error(`seed campuses: ${ce.message}`);

  // --- products + batches + balancing ledger for the two live campuses ---
  let productCount = 0;
  let batchCount = 0;
  let ledgerCount = 0;

  async function seedItems(campusId: string, specs: SeedItemSpec[]) {
    for (const s of specs) {
      const productKey = correctionKey(s.name, s.brand);
      // Upsert the product, then read its id back.
      const { error: pe } = await db.from("products").upsert(
        {
          campus_id: campusId,
          product_key: productKey,
          name: s.name,
          brand: s.brand || null,
          category: s.category,
          category_group: categoryGroup(s.category),
          unit: s.unit,
          no_expire: !!s.noExpire,
          source: s.source,
        },
        { onConflict: "campus_id,product_key" },
      );
      if (pe) throw new Error(`seed product ${s.name}: ${pe.message}`);
      productCount++;

      const { data: prod, error: ge } = await db
        .from("products")
        .select("id")
        .eq("campus_id", campusId)
        .eq("product_key", productKey)
        .single();
      if (ge || !prod) throw new Error(`seed product lookup ${s.name}: ${ge?.message}`);
      const productId = prod.id as string;

      const receivedOn = isoFromOffset(todayIso, s.restockOffsetDays);
      const expiresOn = s.expiresOffsetDays === null ? null : isoFromOffset(todayIso, s.expiresOffsetDays);

      // Intake batch sized to `of` (idempotent by deterministic key).
      const { error: be } = await db.from("item_batches").upsert(
        {
          campus_id: campusId,
          product_id: productId,
          quantity: s.of,
          received_on: receivedOn,
          expires_on: expiresOn,
          date_type: null,
          date_precision: null,
          date_source: "imported",
          idempotency_key: `seed:${campusId}:${s.id}:b0`,
        },
        { onConflict: "campus_id,idempotency_key" },
      );
      if (be) throw new Error(`seed batch ${s.name}: ${be.message}`);
      batchCount++;

      // Balancing take-out so derived on-shelf == qty.
      const consumed = s.of - s.qty;
      if (consumed > 0) {
        const { error: le } = await db.from("ledger_entries").upsert(
          {
            campus_id: campusId,
            product_id: productId,
            delta: -consumed,
            kind: "takeout",
            source: "system",
            reason: "Seed baseline",
            idempotency_key: `seed:${campusId}:${s.id}:out`,
          },
          { onConflict: "campus_id,idempotency_key" },
        );
        if (le) throw new Error(`seed ledger ${s.name}: ${le.message}`);
        ledgerCount++;
      }
    }
  }

  await seedItems("harbor", HARBOR_ITEMS);
  await seedItems("cedar", CEDAR_ITEMS);

  // --- offers + requests from the sample (non-live) campuses: replace the set ---
  await db.from("offers").delete().in("id", SEED_OFFERS.map((o) => seedOfferId(o.id)));
  const offerRows = SEED_OFFERS.map((o) => ({
    id: seedOfferId(o.id),
    campus_id: o.campusId,
    product_id: null,
    name: o.name,
    unit: o.unit,
    qty: o.qty,
    category: o.category,
    expires_on: o.expiresOffsetDays === null ? null : isoFromOffset(todayIso, o.expiresOffsetDays),
    no_expire: !!o.noExpire,
    status: "open",
  }));
  const { error: oe } = await db.from("offers").insert(offerRows);
  if (oe) throw new Error(`seed offers: ${oe.message}`);

  await db.from("requests").delete().in("id", SEED_REQUESTS.map((r) => seedRequestId(r.id)));
  const requestRows = SEED_REQUESTS.map((r) => ({
    id: seedRequestId(r.id),
    campus_id: r.campusId,
    name: r.name,
    category: r.category,
    qty: r.qty,
  }));
  const { error: re } = await db.from("requests").insert(requestRows);
  if (re) throw new Error(`seed requests: ${re.message}`);

  return {
    campuses: campusRows.length,
    products: productCount,
    batches: batchCount,
    ledger: ledgerCount,
    offers: offerRows.length,
    requests: requestRows.length,
    tokens,
  };
}

// Deterministic UUIDv5-ish ids for seed offers/requests so re-seeding replaces
// the same rows. We derive a stable uuid from a namespace + the seed id.
function seedOfferId(localId: string): string {
  return stableUuid(`offer:${localId}`);
}
function seedRequestId(localId: string): string {
  return stableUuid(`request:${localId}`);
}

// A deterministic uuid from a string (not cryptographic; just stable for seeds).
function stableUuid(key: string): string {
  // Simple FNV-1a → fill a uuid shape; deterministic per key.
  let h = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < key.length; j++) {
      h ^= key.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes.push(h & 0xff);
  }
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

// randomUUID is kept available for any future non-deterministic seed rows.
void randomUUID;
