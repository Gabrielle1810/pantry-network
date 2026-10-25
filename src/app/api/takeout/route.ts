// POST /api/takeout — manager actions on Take-out, for the ACTIVE campus.
// Behind the staff PIN (middleware). One endpoint, one `action` per call:
//   record   staff removal (Record items out). "Moved to Community" reserves, never subtracts.
//   fix      change an entry's quantities (stock moves by the difference)
//   delete   delete an entry (stock goes back)
//   undo     undo a just-recorded entry (server-limited to a short window)
//   recount  "Count looks off": use the counted number, or keep the system's
//   held     accept or discard a student submission held for review
// No names are accepted or stored anywhere in these calls.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";
import { REASONS, type ReasonCode } from "@/lib/takeout";

const id = z.string().min(1).max(100);
const line = z.object({ productId: id, qty: z.number().int().min(0).max(999) });
const reason = z.enum(REASONS.map((r) => r.code) as [ReasonCode, ...ReasonCode[]]);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), reason, lines: z.array(line).min(1).max(100), idempotencyKey: id.nullable().optional() }),
  z.object({ action: z.literal("fix"), groupId: id, lines: z.array(line).max(100) }),
  z.object({ action: z.literal("delete"), groupId: id }),
  z.object({ action: z.literal("undo"), groupId: id.nullable(), offerIds: z.array(id).max(100).default([]) }),
  z.object({ action: z.literal("recount"), checkId: id, useCounted: z.boolean() }),
  z.object({ action: z.literal("held"), heldId: id, accept: z.boolean() }),
]);

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const body = parsed.data;

  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const today = todayInTz();
  const repo = getAppRepository(today);

  try {
    switch (body.action) {
      case "record": {
        const result = await repo.recordOut(
          { campusId, reason: body.reason, lines: body.lines, idempotencyKey: body.idempotencyKey ?? null },
          today,
        );
        return NextResponse.json({ ok: result.status !== "empty", ...result });
      }
      case "fix": {
        const ok = await repo.fixEntry(campusId, body.groupId, body.lines, today);
        return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
      }
      case "delete": {
        const ok = await repo.deleteEntry(campusId, body.groupId, today);
        return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
      }
      case "undo": {
        const ok = await repo.undoEntry(campusId, body.groupId, body.offerIds);
        return NextResponse.json({ ok });
      }
      case "recount": {
        const ok = await repo.resolveCountCheck(campusId, body.checkId, body.useCounted, today);
        return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
      }
      case "held": {
        const ok = await repo.resolveHeld(campusId, body.heldId, body.accept, today);
        return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
      }
    }
  } catch (err) {
    console.error(`[takeout] ${body.action} failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
