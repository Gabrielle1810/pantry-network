import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSeedPlan, CEDAR_ITEMS, HARBOR_ITEMS } from "./seed";
import { deriveOnShelf } from "@/lib/stock";
import { todayInTz } from "@/lib/dates";

// ---- a tiny in-memory stand-in for the supabase-js query builder ----
type Row = Record<string, unknown>;
const CASCADE: Record<string, string[]> = { products: ["item_batches", "ledger_entries", "count_checks"] };

class FakeDb {
  tables: Record<string, Row[]> = {};
  private seq = 0;
  from(table: string) {
    this.tables[table] ??= [];
    return new Query(this, table);
  }
  newId() {
    this.seq += 1;
    return `00000000-0000-0000-0000-${String(this.seq).padStart(12, "0")}`;
  }
}

type Result = { data: Row[] | null; error: null };

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "upsert" | "delete" = "select";
  private rows: Row[] = [];
  private conflict: string[] = [];
  private filters: ((r: Row) => boolean)[] = [];
  private returning = false;
  constructor(private db: FakeDb, private table: string) {}
  select() {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict: string }) {
    this.op = "upsert";
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts.onConflict.split(",");
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  like(c: string, pattern: string) {
    const prefix = pattern.replace(/%$/, "");
    this.filters.push((r) => String(r[c] ?? "").startsWith(prefix));
    return this;
  }
  private run(): Row[] | null {
    const t = this.db.tables[this.table];
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === "select") return t.filter(match);
    if (this.op === "delete") {
      const gone = t.filter(match);
      this.db.tables[this.table] = t.filter((r) => !match(r));
      for (const child of CASCADE[this.table] ?? []) {
        const ids = new Set(gone.map((r) => r.id));
        this.db.tables[child] = (this.db.tables[child] ?? []).filter((r) => !ids.has(r.product_id));
      }
      return null;
    }
    const out: Row[] = [];
    for (const row of this.rows) {
      const existing = this.op === "upsert" ? t.find((r) => this.conflict.every((c) => r[c] === row[c])) : undefined;
      if (existing) {
        Object.assign(existing, row);
        out.push(existing);
      } else {
        const created = { id: this.db.newId(), ...row };
        t.push(created);
        out.push(created);
      }
    }
    return this.returning ? out : null;
  }
  then<A = Result, B = never>(
    ok?: ((v: Result) => A | PromiseLike<A>) | null,
    fail?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve<Result>({ data: this.run(), error: null }).then(ok, fail);
  }
}

let fake: FakeDb;
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fake }));
const { seedSupabase } = await import("./seed-supabase");

// The demo may only use these invented brands (no third-party trademarks in the
// hackathon video). An allow-list also catches brands nobody thought to ban.
const INVENTED_BRANDS = new Set([
  "Harbor Pantry",
  "Valley Farms",
  "Sunrise",
  "Golden Field",
  "Green Meadow",
  "Quick Bowl",
  "Orchard Lane",
  "Hilltop",
  "Bay Catch",
  "Spice Rack",
  "Fresh Day",
]);
// Product names stay generic: no "Cereal (SomeBrand)" style names.
const BRAND_IN_NAME = /\([A-Z]/;

const TODAY = todayInTz();

function onShelf(db: FakeDb, campus: string, name: string): number {
  const p = db.tables.products.find((r) => r.campus_id === campus && r.name === name)!;
  const batches = db.tables.item_batches
    .filter((b) => b.product_id === p.id)
    .map((b) => ({ id: String(b.id), productKey: String(p.id), quantity: Number(b.quantity), receivedOn: String(b.received_on), createdAt: String(b.created_at), expiresOn: null }));
  const ledger = db.tables.ledger_entries
    .filter((l) => l.product_id === p.id)
    .map((l) => ({ id: String(l.id), productKey: String(p.id), delta: Number(l.delta), kind: "takeout" as const, at: "", createdAt: "" }));
  return deriveOnShelf(batches, ledger);
}

describe("sample data has no real brands", () => {
  it("every brand is an invented one and no name carries a brand", () => {
    const plan = buildSeedPlan(TODAY);
    for (const { items } of plan.campuses) {
      for (const i of items) {
        expect(i.product.name, i.ref).not.toMatch(BRAND_IN_NAME);
        if (i.product.brand) expect(INVENTED_BRANDS.has(i.product.brand), `${i.ref}: ${i.product.brand}`).toBe(true);
      }
    }
    for (const o of plan.offers) expect(o.name).not.toMatch(BRAND_IN_NAME);
    for (const r of plan.requests) expect(r.name).not.toMatch(BRAND_IN_NAME);
  });
});

describe("seedSupabase reset (Settings > Reset demo data)", () => {
  beforeEach(() => {
    fake = new FakeDb();
    // An older seed with a since-renamed product, and an existing student token.
    fake.tables.campuses = [{ id: "harbor", name: "Harbor University", student_token: "keep-this-printed-poster-token-123" }];
    fake.tables.products = [{ id: "old-1", campus_id: "harbor", product_key: "old cereal|old brand", name: "Old cereal", brand: "Old Brand" }];
    fake.tables.item_batches = [{ id: "old-b", campus_id: "harbor", product_id: "old-1", quantity: 12, idempotency_key: "seed:harbor:oldcereal:b0" }];
    fake.tables.ledger_entries = [{ id: "old-l", campus_id: "harbor", product_id: "old-1", delta: -12, idempotency_key: "seed:harbor:oldcereal:out" }];
  });

  it("replaces the old sample products with the current ones, keeping numbers and tokens", async () => {
    const result = await seedSupabase("https://fake.supabase.co", "service-role", TODAY, { reset: true });

    const plan = buildSeedPlan(TODAY);
    const expected = plan.campuses.flatMap(({ campusId, items }) => items.map((i) => `${campusId}|${i.product.name}|${i.product.brand}`));
    const actual = fake.tables.products.map((p) => `${p.campus_id}|${p.name}|${p.brand}`);
    expect(actual.sort()).toEqual(expected.sort());
    expect(fake.tables.products.filter((p) => p.campus_id === "harbor")).toHaveLength(HARBOR_ITEMS.length);
    expect(fake.tables.products.filter((p) => p.campus_id === "cedar")).toHaveLength(CEDAR_ITEMS.length);
    expect(fake.tables.item_batches.some((b) => b.id === "old-b")).toBe(false); // cascaded away
    expect(result.tokens.harbor).toBe("keep-this-printed-poster-token-123"); // posters keep working

    // Same numbers as the prototype.
    expect(onShelf(fake, "harbor", "Oat cereal cups")).toBe(0);
    expect(onShelf(fake, "harbor", "Tomato paste")).toBe(2);
    expect(onShelf(fake, "harbor", "Peanut butter (single serve)")).toBe(150);
    expect(onShelf(fake, "cedar", "Canned corn")).toBe(30);
    expect(fake.tables.offers).toHaveLength(8);
    expect(fake.tables.requests).toHaveLength(3);
  });

  it("is idempotent: a second run without reset adds nothing", async () => {
    await seedSupabase("https://fake.supabase.co", "service-role", TODAY, { reset: true });
    const counts = () => ["products", "item_batches", "ledger_entries", "offers", "requests", "count_checks"].map((t) => fake.tables[t].length);
    const before = counts();
    const again = await seedSupabase("https://fake.supabase.co", "service-role", TODAY);
    expect(counts()).toEqual(before);
    expect(again).toMatchObject({ batches: 0, ledger: 0, offers: 0, requests: 0, countChecks: 0 });
  });
});
