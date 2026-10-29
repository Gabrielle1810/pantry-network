import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { getMemoryAppRepository, resetMemoryAppRepository } from "@/lib/db/app-memory";
import { todayInTz } from "@/lib/dates";

const run = (path: string) => proxy(new NextRequest(`http://localhost${path}`));

describe("proxy: student links", () => {
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetMemoryAppRepository();
  });

  it("a plain campus id or unknown token is a real 404 that shows nothing", async () => {
    for (const path of ["/s/harbor", "/s/cedar", `/s/${"A".repeat(32)}`, "/s"]) {
      const res = await run(path);
      expect(res.status, path).toBe(404);
      const html = await res.text();
      expect(html).toContain("This link doesn't work");
      expect(html).not.toContain("Harbor University");
      expect(html).not.toContain("Jasmine rice");
    }
  });

  it("the campus's real token passes through to the page", async () => {
    const token = (await getMemoryAppRepository(todayInTz()).getCampus("harbor"))!.studentToken;
    const res = await run(`/s/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy: staff session", () => {
  it("manager APIs need the PIN session; pages redirect to /pin", async () => {
    expect((await run("/api/takeout")).status).toBe(401);
    expect((await run("/api/community")).status).toBe(401);
    const page = await run("/inventory");
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("http://localhost/pin");
  });

  it("the public student API and /pin are not guarded", async () => {
    expect((await run("/api/student/takeout")).headers.get("x-middleware-next")).toBe("1");
    expect((await run("/pin")).headers.get("x-middleware-next")).toBe("1");
  });
});
