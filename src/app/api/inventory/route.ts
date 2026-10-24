// GET /api/inventory — derived inventory rows for the active campus (PD.1).
// Session-guarded by middleware (manager API). Stock + status are derived
// server-side from batches + ledger; the client only renders.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";

export async function GET() {
  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const todayIso = todayInTz();
  const repo = getAppRepository(todayIso);
  try {
    const items = await repo.listInventory(campusId, todayIso);
    return NextResponse.json({ repository: repo.name, campusId, today: todayIso, items });
  } catch (err) {
    console.error(`[inventory] list failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
}
