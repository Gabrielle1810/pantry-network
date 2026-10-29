// POST /api/community — Community actions for the ACTIVE campus (behind the PIN).
//   offer     post an offer (reserves stock; never subtracts it)
//   withdraw  withdraw your open offer (releases the reservation)
//   request   open a request
//   claim     claim part of another campus's offer → pending pickup
//   pickup    "Mark picked up": stock leaves the offering campus once and
//             arrives here as a new batch
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";

const id = z.string().min(1).max(100);
const qty = z.number().int().min(1).max(999);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("offer"), productId: id, qty, note: z.string().max(200).nullable().optional(), requestId: id.nullable().optional() }),
  z.object({ action: z.literal("withdraw"), offerId: id }),
  z.object({ action: z.literal("request"), name: z.string().min(1).max(80), category: z.string().min(1).max(60), qty }),
  z.object({ action: z.literal("claim"), offerId: id, qty }),
  z.object({ action: z.literal("pickup"), pickupId: id }),
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

  const reply = (data: object | null) =>
    data ? NextResponse.json({ ok: true, ...data }) : NextResponse.json({ ok: false }, { status: 409 });

  try {
    switch (body.action) {
      case "offer":
        return reply(
          await repo.createOffer(
            { campusId, productId: body.productId, qty: body.qty, note: body.note ?? null, requestId: body.requestId ?? null },
            today,
          ),
        );
      case "withdraw":
        return reply((await repo.withdrawOffer(campusId, body.offerId)) ? {} : null);
      case "request":
        return reply(await repo.createRequest({ campusId, name: body.name, category: body.category, qty: body.qty }));
      case "claim":
        return reply(await repo.claimOffer(campusId, body.offerId, body.qty));
      case "pickup":
        return reply(await repo.completePickup(campusId, body.pickupId, today));
    }
  } catch (err) {
    console.error(`[community] ${body.action} failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
