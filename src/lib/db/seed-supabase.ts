// Idempotent Supabase seeding. SERVER-ONLY (service-role key). Loads the shared
// seed plan: two live campuses (harbor full, cedar smaller), the four
// Community-only campuses, the demo "Out today" feed, offers, requests and a
// sample count check.
//
//  * Default run: adds only what is missing (keyed rows are skipped), so running
//    it twice duplicates nothing and never rolls back live changes.
//  * reset: first deletes ALL data for the six sample campuses (stock, ledger,
//    offers, requests, pickups, held submissions, device log, count checks,
//    remembered fixes), then seeds fresh. Student tokens are kept so printed
//    posters stay valid.
//  * student_token is generated with crypto ONLY for a campus that has none, so
//    no token is ever hard-coded in the repo (PI.1).
//
// Needs migrations 002, 003 and 004.
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CAMPUSES } from "@/lib/campus";
import { buildSeedPlan, stableUuid } from "./seed";

export interface SeedResult {
  campuses: number;
  products: number;
  batches: number;
  ledger: number;
  offers: number;
  requests: number;
  countChecks: number;
  reset: boolean;
  /** campusId → student_token (for the student URL / poster). */
  tokens: Record<string, string>;
}

function newToken(): string {
  return randomBytes(24).toString("base64url"); // unguessable, URL-safe
}

function check(label: string, error: { message: string } | null) {
  if (error) throw new Error(`seed ${label}: ${error.message}`);
}

export async function seedSupabase(
  url: string,
  serviceRoleKey: string,
  todayIso: string,
  opts: { reset?: boolean; nowMs?: number } = {},
): Promise<SeedResult> {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ids = Object.keys(CAMPUSES);

  if (opts.reset) {
    // Children before parents. Products cascade to batches, ledger and checks.
    const steps: [string, string][] = [
      ["pickups", "from_campus"],
      ["pickups", "to_campus"],
      ["offers", "campus_id"],
      ["requests", "campus_id"],
      ["held_submissions", "campus_id"],
      ["student_submissions", "campus_id"],
      ["count_checks", "campus_id"],
      ["product_corrections", "campus_id"],
      ["products", "campus_id"],
    ];
    for (const [table, column] of steps) {
      const { error } = await db.from(table).delete().in(column, ids);
      check(`reset ${table}`, error);
    }
  }

  // --- campuses: upsert, preserving any existing student_token ---
  const { data: existing, error: ee } = await db.from("campuses").select("id, student_token");
  check("read campuses", ee);
  const existingTokens = new Map<string, string>((existing ?? []).map((c) => [c.id as string, c.student_token as string]));
  const tokens: Record<string, string> = {};
  const campusRows = Object.values(CAMPUSES).map((c) => {
    const token = existingTokens.get(c.id) ?? newToken();
    tokens[c.id] = token;
    return {
      id: c.id, name: c.name, region: c.region, miles: c.miles, place: c.place ?? null,
      hours: c.hours ?? null, contact: c.contact ?? null, live: c.live, student_token: token,
    };
  });
  check("campuses", (await db.from("campuses").upsert(campusRows, { onConflict: "id" })).error);

  const plan = buildSeedPlan(todayIso, opts.nowMs ?? Date.now());
  const productIds = new Map<string, string>(); // "campus:ref" → product uuid
  const counts = { products: 0, batches: 0, ledger: 0, offers: 0, requests: 0, countChecks: 0 };

  for (const { campusId, items } of plan.campuses) {
    // Products: one upsert (full unique constraint on campus_id + product_key).
    const { data: prods, error: pe } = await db
      .from("products")
      .upsert(
        items.map(({ product: p }) => ({
          campus_id: campusId, product_key: p.productKey, name: p.name, brand: p.brand, size_text: p.sizeText,
          category: p.category, category_group: p.categoryGroup, unit: p.unit, no_expire: p.noExpire, source: p.source,
        })),
        { onConflict: "campus_id,product_key" },
      )
      .select("id, product_key");
    check(`products (${campusId})`, pe);
    const byKey = new Map((prods ?? []).map((r) => [r.product_key as string, r.id as string]));
    for (const item of items) {
      const id = byKey.get(item.product.productKey);
      if (!id) throw new Error(`seed products (${campusId}): missing ${item.ref}`);
      productIds.set(`${campusId}:${item.ref}`, id);
    }
    counts.products += items.length;

    // Batches: insert only the ones whose seed key isn't there yet.
    const { data: haveB, error: hb } = await db
      .from("item_batches").select("idempotency_key").eq("campus_id", campusId).like("idempotency_key", "seed:%");
    check(`read batches (${campusId})`, hb);
    const doneB = new Set((haveB ?? []).map((r) => r.idempotency_key as string));
    const newBatches = items.flatMap((item) =>
      item.batches.filter((b) => !doneB.has(b.key)).map((b) => ({
        campus_id: campusId, product_id: productIds.get(`${campusId}:${item.ref}`)!, quantity: b.quantity,
        received_on: b.receivedOn, expires_on: b.expiresOn, date_type: null, date_precision: null,
        date_source: "imported", idempotency_key: b.key, created_at: b.createdAt,
      })),
    );
    if (newBatches.length) check(`batches (${campusId})`, (await db.from("item_batches").insert(newBatches)).error);
    counts.batches += newBatches.length;

    // Ledger: baseline take-outs and the demo feed.
    const { data: haveL, error: hl } = await db
      .from("ledger_entries").select("idempotency_key").eq("campus_id", campusId).like("idempotency_key", "seed:%");
    check(`read ledger (${campusId})`, hl);
    const doneL = new Set((haveL ?? []).map((r) => r.idempotency_key as string));
    const newLedger = items.flatMap((item) =>
      item.ledger.filter((l) => !doneL.has(l.key)).map((l) => ({
        campus_id: campusId, product_id: productIds.get(`${campusId}:${item.ref}`)!, delta: l.delta, kind: l.kind,
        source: l.source, reason: l.reason, group_id: l.groupKey ? stableUuid(l.groupKey) : null,
        idempotency_key: l.key, created_at: l.createdAt,
      })),
    );
    if (newLedger.length) check(`ledger (${campusId})`, (await db.from("ledger_entries").insert(newLedger)).error);
    counts.ledger += newLedger.length;
  }

  // --- offers / requests / count checks: add the missing ones (stable ids) ---
  async function insertMissing(table: string, rows: { id: string }[]): Promise<number> {
    if (rows.length === 0) return 0;
    const { data, error } = await db.from(table).select("id").in("id", rows.map((r) => r.id));
    check(`read ${table}`, error);
    const have = new Set((data ?? []).map((r) => r.id as string));
    const fresh = rows.filter((r) => !have.has(r.id));
    if (fresh.length) check(table, (await db.from(table).insert(fresh)).error);
    return fresh.length;
  }

  counts.offers = await insertMissing(
    "offers",
    plan.offers.map((o) => ({
      id: stableUuid(`offer:${o.id}`), campus_id: o.campusId,
      product_id: o.productRef ? (productIds.get(`${o.campusId}:${o.productRef}`) ?? null) : null,
      name: o.name, unit: o.unit, qty: o.qty, category: o.category, expires_on: o.expiresOn,
      no_expire: o.noExpire, status: "open",
    })),
  );
  counts.requests = await insertMissing(
    "requests",
    plan.requests.map((r) => ({
      id: stableUuid(`request:${r.id}`), campus_id: r.campusId, name: r.name, category: r.category, qty: r.qty,
    })),
  );
  counts.countChecks = await insertMissing(
    "count_checks",
    plan.counts.map((c) => ({
      id: stableUuid(`count:${c.id}`), campus_id: c.campusId,
      product_id: productIds.get(`${c.campusId}:${c.ref}`)!, counted: c.counted, status: "open",
    })),
  );

  return { campuses: campusRows.length, reset: !!opts.reset, tokens, ...counts };
}
