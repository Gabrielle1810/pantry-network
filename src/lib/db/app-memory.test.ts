import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MemoryAppRepository } from "./app-memory";
import { getAppRepository } from "./index";
import { HARBOR_ITEMS, CEDAR_ITEMS } from "./seed";

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
