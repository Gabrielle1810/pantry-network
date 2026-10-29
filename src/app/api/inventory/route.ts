// /api/inventory — the active campus's inventory. Session-guarded by the proxy
// (manager API). Stock + status are derived server-side from batches + ledger.
//   GET   derived rows
//   POST  { action: "edit", productId, edit }  edit drawer / Full sheet cell.
//         An on-shelf change becomes an "Edited by staff" adjustment for the
//         difference; it never overwrites a stored number (PD.7a).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAppRepository } from "@/lib/db";
import { isValidIsoDate, todayInTz } from "@/lib/dates";
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

const isoDate = z.string().refine(isValidIsoDate, "invalid date");
const editSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    brand: z.string().trim().max(60).nullable(),
    unit: z.string().trim().min(1).max(30),
    category: z.string().trim().min(1).max(60),
    source: z.enum(["donated", "purchased"]).nullable(),
    noExpire: z.boolean(),
    onShelf: z.number().int().min(0).max(9999),
    expiresOn: isoDate.nullable(),
  })
  .partial()
  .strict();
const bodySchema = z.object({ action: z.literal("edit"), productId: z.string().min(1).max(100), edit: editSchema });

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { productId, edit } = parsed.data;

  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();
  try {
    const result = await getAppRepository(today).editProduct({ campusId, productId, edit }, today);
    switch (result.status) {
      case "saved":
      case "unchanged":
        return NextResponse.json({ ok: true, ...result });
      case "not_found":
        return NextResponse.json({ ok: false, status: result.status }, { status: 404 });
      case "conflict":
      case "reserved":
        return NextResponse.json({ ok: false, ...result }, { status: 409 });
    }
  } catch (err) {
    console.error(`[inventory] edit failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
