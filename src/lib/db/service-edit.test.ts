import { describe, expect, it } from "vitest";
import { todayInTz } from "@/lib/dates";
import { EDIT_REASON } from "@/lib/inventory";
import { isoFromOffset } from "./seed";
import { AppService } from "./service";
import { MemoryStore } from "./store-memory";

const TODAY = todayInTz();
const C = "harbor";

function setup() {
  const store = new MemoryStore(TODAY);
  return { store, repo: new AppService(store) };
}

const row = async (repo: AppService, id: string) => (await repo.getProduct(C, id, TODAY))!;
const batchesOf = async (store: MemoryStore, id: string) => (await store.listBatches(C)).filter((b) => b.productId === id);
const ledgerOf = async (store: MemoryStore, id: string) => (await store.listLedger(C)).filter((l) => l.productId === id);

describe("Inventory edit drawer and Full sheet (PD.7, PD.7a, PD.10)", () => {
  it("PD.7a editing on-shelf writes an 'Edited by staff' adjustment equal to the difference; batches unchanged", async () => {
    const { store, repo } = setup();
    const id = "harbor:corn";
    expect((await row(repo, id)).onShelf).toBe(5);
    const batchesBefore = await batchesOf(store, id);
    const ledgerBefore = await ledgerOf(store, id);

    const up = await repo.editProduct({ campusId: C, productId: id, edit: { onShelf: 8 } }, TODAY);
    expect(up.status).toBe("saved");
    const down = await repo.editProduct({ campusId: C, productId: id, edit: { onShelf: 2 } }, TODAY);
    expect(down.status).toBe("saved");

    const added = (await ledgerOf(store, id)).slice(ledgerBefore.length);
    expect(added.map((l) => l.delta)).toEqual([3, -6]);
    for (const l of added) {
      expect(l).toMatchObject({ kind: "recount", source: "staff", reason: EDIT_REASON });
    }
    expect(await batchesOf(store, id)).toEqual(batchesBefore);
    expect((await row(repo, id)).onShelf).toBe(2);
  });

  it("PD.7a typing the same number again writes nothing", async () => {
    const { store, repo } = setup();
    const before = (await store.listLedger(C)).length;
    const r = await repo.editProduct({ campusId: C, productId: "harbor:corn", edit: { onShelf: 5, name: "Canned corn" } }, TODAY);
    expect(r.status).toBe("unchanged");
    expect((await store.listLedger(C)).length).toBe(before);
  });

  it("PD.7 detail edits update in place, keep stock, and leave a history line", async () => {
    const { store, repo } = setup();
    const id = "harbor:corn";
    const r = await repo.editProduct(
      { campusId: C, productId: id, edit: { name: "Sweet corn", category: "Canned Goods", source: "donated" } },
      TODAY,
    );
    expect(r.status).toBe("saved");
    const now = await row(repo, id);
    expect(now).toMatchObject({ name: "Sweet corn", source: "donated", onShelf: 5, productKey: "sweet corn|valley farms" });
    const last = (await ledgerOf(store, id)).at(-1)!;
    expect(last).toMatchObject({ delta: 0, kind: "recount", reason: `${EDIT_REASON}: name, source` });
    const history = (await repo.listHistory(C))[id];
    expect(history[0].text).toBe(`${EDIT_REASON}: name, source`);
  });

  it("refuses a name + brand another product already has, and changes nothing", async () => {
    const { store, repo } = setup();
    const before = (await store.listLedger(C)).length;
    const r = await repo.editProduct(
      { campusId: C, productId: "harbor:corn", edit: { name: "Black beans", brand: "Harbor Pantry", onShelf: 9 } },
      TODAY,
    );
    expect(r.status).toBe("conflict");
    expect((await row(repo, "harbor:corn")).name).toBe("Canned corn");
    expect((await store.listLedger(C)).length).toBe(before);
  });

  it("PD.9a on-shelf can't go below what is set aside for Community", async () => {
    const { repo } = setup();
    await repo.createOffer({ campusId: C, productId: "harbor:corn", qty: 4, note: null }, TODAY);
    const low = await repo.editProduct({ campusId: C, productId: "harbor:corn", edit: { onShelf: 3 } }, TODAY);
    expect(low).toEqual({ status: "reserved", reserved: 4 });
    const ok = await repo.editProduct({ campusId: C, productId: "harbor:corn", edit: { onShelf: 4 } }, TODAY);
    expect(ok.status).toBe("saved");
  });

  it("a best-by edit dates what is on the shelf; 'Doesn't expire' clears it", async () => {
    const { repo } = setup();
    const id = "harbor:tomato";
    expect((await row(repo, id)).status).toBe("soon");
    const later = isoFromOffset(TODAY, 60);
    await repo.editProduct({ campusId: C, productId: id, edit: { expiresOn: later } }, TODAY);
    expect(await row(repo, id)).toMatchObject({ expiresOn: later, status: "good" });

    await repo.editProduct({ campusId: C, productId: id, edit: { noExpire: true } }, TODAY);
    expect(await row(repo, id)).toMatchObject({ expiresOn: null, noExpire: true, status: "good" });
  });

  it("a best-by date with nothing on the shelf is skipped, not invented", async () => {
    const { repo } = setup();
    const r = await repo.editProduct(
      { campusId: C, productId: "harbor:oatcereal", edit: { expiresOn: isoFromOffset(TODAY, 30) } },
      TODAY,
    );
    expect(r.status).toBe("unchanged");
    expect((await row(repo, "harbor:oatcereal")).expiresOn).toBeNull();
  });

  it("returns not_found for another campus's product", async () => {
    const { repo } = setup();
    const r = await repo.editProduct({ campusId: "cedar", productId: "harbor:corn", edit: { onShelf: 1 } }, TODAY);
    expect(r.status).toBe("not_found");
  });
});
