import { describe, expect, it } from "vitest";
import type { InventoryRow } from "@/lib/db/app-types";
import type { Status } from "@/lib/status";
import { todayInTz } from "@/lib/dates";
import { MemoryAppRepository } from "@/lib/db/app-memory";
import { STATUS_RULES, morningEmail } from "./index";

const TODAY = "2026-10-24";

function row(name: string, status: Status, over: Partial<InventoryRow> = {}): InventoryRow {
  return {
    productId: `harbor:${name}`, campusId: "harbor", productKey: name, name, brand: null, unit: "can",
    category: "Canned Goods", categoryGroup: null, source: "donated", noExpire: false, onShelf: 4, reserved: 0,
    lastRestock: 10, lastRestockOn: TODAY, expiresOn: null, status, ...over,
  };
}

describe("morningEmail", () => {
  it("lists out-of-stock first, then expiring soon; nothing else", () => {
    const email = morningEmail(
      [
        row("Tomato paste", "soon", { expiresOn: "2026-10-26", onShelf: 2 }),
        row("Cheerios", "out", { onShelf: 0, category: "Cereal" }),
        row("Rice", "good"),
        row("Sauce", "expired", { expiresOn: "2026-08-01" }),
        row("Beans", "low"),
      ],
      TODAY,
      "Harbor University",
    );
    expect(email.heading).toBe("Good morning, Harbor University team. 2 things need attention");
    expect(email.items.map((i) => [i.name, i.sub, i.action.label])).toEqual([
      ["Cheerios", "Out of stock", "Request items"],
      ["Tomato paste", "2 cans · expires in 2 days", "Offer on Community"],
    ]);
    expect(email.items[0].action.href).toBe("/community?request=Cheerios&category=Cereal");
    expect(email.items[1].action.href).toBe("/community?offer=harbor%3ATomato%20paste");
  });

  it("says so when nothing needs attention", () => {
    expect(morningEmail([row("Rice", "good")], TODAY, "Cedar Hill College").heading).toBe(
      "Good morning, Cedar Hill College team. Nothing needs attention today",
    );
  });

  it("works on the seeded harbor inventory (same rules as the smart cards)", async () => {
    const today = todayInTz();
    const repo = new MemoryAppRepository(today);
    const email = morningEmail(await repo.listInventory("harbor", today), today, "Harbor University");
    expect(email.items[0].name).toBe("Cereal (Cheerios)");
    expect(email.items.some((i) => i.name === "Tomato paste")).toBe(true);
  });
});

describe("STATUS_RULES", () => {
  it("covers every status once, in the order the rules apply", () => {
    expect(STATUS_RULES.map((r) => r.status)).toEqual(["expired", "out", "soon", "low", "nodate", "good"]);
  });
});
