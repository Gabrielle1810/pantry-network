// GET /api/campus — list live campuses + the active one.
// POST /api/campus — switch the active campus (sets a cookie). Session-guarded
// by middleware (manager API). Scopes manager data; the student page is scoped
// by its QR token instead (PC.4/PI.1).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { resolveActiveCampus, LIVE_CAMPUS_IDS } from "@/lib/campus";

export async function GET() {
  const jar = await cookies();
  const active = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const repo = getAppRepository(todayInTz());
  const campuses = await repo.listCampuses();
  return NextResponse.json({ active, campuses });
}

const switchSchema = z.object({ campusId: z.string() });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // Only allow switching to a known live campus.
  const resolved = resolveActiveCampus(parsed.data.campusId);
  if (!LIVE_CAMPUS_IDS.includes(resolved) || resolved !== parsed.data.campusId) {
    // resolveActiveCampus falls back to home for unknown ids; reject an explicit
    // non-live id rather than silently switching home.
    if (!LIVE_CAMPUS_IDS.includes(parsed.data.campusId)) {
      return NextResponse.json({ error: "unknown_campus" }, { status: 400 });
    }
  }
  const response = NextResponse.json({ active: resolved, ok: true });
  response.cookies.set(ACTIVE_CAMPUS_COOKIE, resolved, {
    httpOnly: false, // not a secret; read by server and fine for client display
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
