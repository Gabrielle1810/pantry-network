// POST /api/student/takeout — PUBLIC (no PIN, no login). Students scan the QR
// poster and tap what they took.
//  * The campus comes ONLY from the random student token in the body, never from
//    the manager's campus cookie. A wrong token is a 404.
//  * Quantities are re-capped on the server at on-shelf minus reserved, and
//    expired / empty / reserved items can't be taken, whatever the client sends.
//  * Idempotent per submissionId (a double-tap of Done doesn't double-subtract).
//  * A random device cookie (never a name, never an IP) is the only identifier. A
//    repeat from the same device inside 2 minutes is HELD for staff review.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { isWellFormedToken } from "@/lib/student/page-data";

const DEVICE_COOKIE = "pn_device";
const DEVICE_COOKIE_SECONDS = 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  token: z.string().max(200),
  submissionId: z.string().min(8).max(100),
  lines: z.array(z.object({ productId: z.string().min(1).max(100), qty: z.number().int().min(1).max(999) })).min(1).max(60),
});

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400, headers: noStore });
  const { token, submissionId, lines } = parsed.data;

  // A plain campus id (or anything not token-shaped) is never a valid link.
  if (!isWellFormedToken(token)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });

  const today = todayInTz();
  const repo = getAppRepository(today);

  try {
    const campus = await repo.getCampusByToken(token);
    if (!campus) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });

    const jar = await cookies();
    const existing = jar.get(DEVICE_COOKIE)?.value;
    const deviceId = existing && UUID.test(existing) ? existing : randomUUID();

    const result = await repo.studentTakeout({ campusId: campus.id, deviceId, submissionId, lines }, today);

    const response = NextResponse.json(
      { status: result.status, lines: result.lines.map((l) => ({ name: l.name, qty: l.qty })) },
      { headers: noStore },
    );
    if (deviceId !== existing) {
      response.cookies.set(DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: DEVICE_COOKIE_SECONDS,
      });
    }
    return response;
  } catch (err) {
    console.error(`[student] takeout failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "failed" }, { status: 500, headers: noStore });
  }
}
