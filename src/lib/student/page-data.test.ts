import { describe, expect, it } from "vitest";
import { todayInTz } from "@/lib/dates";
import { MemoryAppRepository } from "@/lib/db/app-memory";
import { isWellFormedToken, loadStudentPage } from "./page-data";

const TODAY = todayInTz();

describe("student page only opens with a real campus token", () => {
  const repo = new MemoryAppRepository(TODAY);

  it("a plain campus id never opens the page or shows the list", async () => {
    for (const id of ["harbor", "cedar", "riverside", "HARBOR"]) {
      expect(isWellFormedToken(id)).toBe(false);
      expect(await loadStudentPage(repo, id, TODAY)).toBeNull();
    }
  });

  it("a well-formed but unknown token returns nothing", async () => {
    const fake = "A".repeat(32);
    expect(isWellFormedToken(fake)).toBe(true);
    expect(await loadStudentPage(repo, fake, TODAY)).toBeNull();
  });

  it("rejects empty, too-long and odd-character tokens", async () => {
    for (const bad of ["", "abc", "x".repeat(200), "has space in it 1234567", "../../etc/passwd-12345"]) {
      expect(await loadStudentPage(repo, bad, TODAY)).toBeNull();
    }
  });

  it("the campus's own token shows only that campus's student list", async () => {
    const harbor = (await repo.getCampus("harbor"))!;
    const data = await loadStudentPage(repo, harbor.studentToken, TODAY);
    expect(data?.campusName).toBe("Harbor University");
    expect(data!.items.length).toBeGreaterThan(0);
    expect(data!.items.every((i) => i.productId.startsWith("harbor:"))).toBe(true);
    expect(data!.items.every((i) => i.available > 0)).toBe(true);
  });
});
