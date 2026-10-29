import { beforeEach, describe, expect, it, vi } from "vitest";

// The route reads the device cookie through next/headers; outside a request we
// stand in a fixed device cookie so repeat detection can be exercised too.
let deviceCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "pn_device" && deviceCookie ? { value: deviceCookie } : undefined) }),
}));

import { POST } from "./route";
import { getMemoryAppRepository, resetMemoryAppRepository } from "@/lib/db/app-memory";
import { todayInTz } from "@/lib/dates";

const TODAY = todayInTz();

function post(body: unknown) {
  return POST(new Request("http://localhost/api/student/takeout", { method: "POST", body: JSON.stringify(body) }));
}

const rice = async () => (await getMemoryAppRepository(TODAY).getProduct("harbor", "harbor:rice", TODAY))!.onShelf;

describe("POST /api/student/takeout", () => {
  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetMemoryAppRepository();
    deviceCookie = "8f14e45f-ceea-4672-9f1b-5d4bce2a1c11";
  });

  it("a plain campus id or unknown token is a 404 and takes nothing", async () => {
    for (const token of ["harbor", "cedar", "B".repeat(32)]) {
      const res = await post({ token, submissionId: "sub-00000001", lines: [{ productId: "harbor:rice", qty: 1 }] });
      expect(res.status).toBe(404);
    }
    expect(await rice()).toBe(4);
  });

  it("a retry with the same submissionId subtracts once (rice 4 → 3, not 2)", async () => {
    const token = (await getMemoryAppRepository(TODAY).getCampus("harbor"))!.studentToken;
    const body = { token, submissionId: "sub-same-0001", lines: [{ productId: "harbor:rice", qty: 1 }] };
    const first = await post(body);
    const retry = await post(body);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect((await retry.json()).status).toBe("recorded");
    expect(await rice()).toBe(3);
  });

  it("a new submission from the same device within 2 minutes is held, not subtracted", async () => {
    const token = (await getMemoryAppRepository(TODAY).getCampus("harbor"))!.studentToken;
    await post({ token, submissionId: "sub-first-001", lines: [{ productId: "harbor:rice", qty: 1 }] });
    const second = await post({ token, submissionId: "sub-second-01", lines: [{ productId: "harbor:rice", qty: 1 }] });
    expect((await second.json()).status).toBe("held");
    expect(await rice()).toBe(3);
  });
});
