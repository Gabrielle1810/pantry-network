import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MemoryAppRepository } from "./app-memory";
import { getAppRepository } from "./index";
import { HARBOR_ITEMS, CEDAR_ITEMS } from "./seed";
import type { IntakeInput } from "./app-types";

const TODAY = "2026-10-24";

describe("MemoryAppRepository seed (decision #2: numbers match data.js)", () => {
  it("harbor derived on-shelf equals each item's data.js qty", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const rows = await repo.listInventory("harbor", TODAY);
    for (const spec of HARBOR_ITEMS) {
      const row = rows.find((r) => r.productId === `harbor:${spec.id}`);
      expect(row, `row for ${spec.id}`).toBeDefined();
      expect(row!.onShelf, `on-shelf for ${spec.name}`).toBe(spec.qty);
      expect(row!.lastRestock, `last restock for ${spec.name}`).toBe(spec.of);
    }
  });

  it("cedar is a smaller live campus", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const rows = await repo.listInventory("cedar", TODAY);
    expect(rows.length).toBe(CEDAR_ITEMS.length);
    for (const spec of CEDAR_ITEMS) {
      const row = rows.find((r) => r.productId === `cedar:${spec.id}`);
      expect(row!.onShelf).toBe(spec.qty);
    }
  });

  it("lists exactly the two live campuses", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const campuses = await repo.listCampuses();
    expect(campuses.map((c) => c.id).sort()).toEqual(["cedar", "harbor"]);
  });

  it("status reflects seeded relative dates: tomato paste is expiring soon", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const rows = await repo.listInventory("harbor", TODAY);
    const tomato = rows.find((r) => r.productId === "harbor:tomato")!;
    expect(tomato.status).toBe("soon"); // seeded +2 days
    const cheerios = rows.find((r) => r.productId === "harbor:cheerios")!;
    expect(cheerios.status).toBe("out"); // qty 0
    const sauce = rows.find((r) => r.productId === "harbor:sauce")!;
    expect(sauce.status).toBe("expired"); // seeded -55 days
  });
});

describe("PO.4 student inventory hides expired and out", () => {
  it("excludes expired and zero-stock items", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const rows = await repo.listStudentInventory("harbor", TODAY);
    expect(rows.every((r) => r.status !== "expired")).toBe(true);
    expect(rows.every((r) => r.onShelf - r.reserved > 0)).toBe(true);
    // cheerios (out) and sauce (expired) must not appear
    expect(rows.find((r) => r.productId === "harbor:cheerios")).toBeUndefined();
    expect(rows.find((r) => r.productId === "harbor:sauce")).toBeUndefined();
  });
});

describe("saveIntake (Step 3: every save creates or reuses a product + adds a batch)", () => {
  const input = (overrides: Partial<IntakeInput> = {}): IntakeInput => ({
    campusId: "harbor",
    idempotencyKey: null,
    receivedOn: TODAY,
    product: {
      name: "Lentils",
      brand: "Goya",
      sizeText: null,
      category: "Dried Pasta/Grains",
      categoryGroup: null,
      unit: "bag",
      noExpire: false,
      source: "donated",
    },
    quantity: 5,
    expiresOn: null,
    dateType: null,
    datePrecision: null,
    dateSource: null,
    editedFields: [],
    read: null,
    ...overrides,
  });

  it("a new product shows up in Inventory right away", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const r = await repo.saveIntake(input());
    expect(r.totals).toEqual({ before: 0, added: 5, after: 5, firstBatch: true });
    const row = (await repo.listInventory("harbor", TODAY)).find((x) => x.name === "Lentils");
    expect(row?.onShelf).toBe(5);
    expect(row?.lastRestock).toBe(5);
  });

  it("reuses an existing product by product_key (case and spaces ignored); before + added = after", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const r = await repo.saveIntake(
      input({ product: { ...input().product, name: "tomato  PASTE", brand: "HUNT'S", category: "Sauces/Pastes/Spread", unit: "can" }, quantity: 4 }),
    );
    expect(r.product.id).toBe("harbor:tomato");
    expect(r.totals).toEqual({ before: 2, added: 4, after: 6, firstBatch: false });
    const tomato = await repo.getProduct("harbor", "harbor:tomato", TODAY);
    expect(tomato?.onShelf).toBe(6);
    expect(tomato?.lastRestock).toBe(4); // last restock = newest batch
  });

  it("is idempotent: a repeated key adds nothing", async () => {
    const repo = new MemoryAppRepository(TODAY);
    const first = await repo.saveIntake(input({ idempotencyKey: "same" }));
    const second = await repo.saveIntake(input({ idempotencyKey: "same", quantity: 99 }));
    expect(second.duplicate).toBe(true);
    expect(second.batch.id).toBe(first.batch.id);
    const row = (await repo.listInventory("harbor", TODAY)).find((x) => x.name === "Lentils");
    expect(row?.onShelf).toBe(5);
  });

  it("saves are scoped to the campus", async () => {
    const repo = new MemoryAppRepository(TODAY);
    await repo.saveIntake(input({ campusId: "cedar" }));
    expect((await repo.listInventory("harbor", TODAY)).some((x) => x.name === "Lentils")).toBe(false);
    expect((await repo.listInventory("cedar", TODAY)).some((x) => x.name === "Lentils")).toBe(true);
  });

  it("round-trips a remembered fix per campus", async () => {
    const repo = new MemoryAppRepository(TODAY);
    await repo.saveCorrection("harbor", "tomato pase|hunts", { name: "Tomato paste", brand: "Hunt's", category: "Sauces/Pastes/Spread" });
    expect((await repo.getCorrection("harbor", "tomato pase|hunts"))?.name).toBe("Tomato paste");
    expect(await repo.getCorrection("cedar", "tomato pase|hunts")).toBeNull();
  });
});

describe("getAppRepository selector", () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("returns memory when Supabase env vars are absent", () => {
    expect(getAppRepository(TODAY).name).toBe("memory");
  });

  it("returns supabase only when BOTH env vars are set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    expect(getAppRepository(TODAY).name).toBe("supabase");
  });

  it("stays on memory when only one var is set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    expect(getAppRepository(TODAY).name).toBe("memory");
  });
});
