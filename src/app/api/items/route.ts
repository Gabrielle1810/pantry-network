// POST /api/items — save one batch (UI13.2). GET /api/items?since=today — list.
// Session is enforced by middleware (matcher covers /api/items). Thin shell:
// validates, stamps campus/received_on/arrived_expired, saves idempotently,
// records a product correction when name/brand/category were edited, and returns
// the saved batch + inventory totals. Persistence errors are NOT fail-soft.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/db";
import { batchInputSchema, computeArrivedExpired } from "@/lib/items/schema";
import { todayInTz } from "@/lib/dates";
import { inventoryTotals } from "@/lib/totals";
import { correctionKey, diffCorrection } from "@/lib/corrections";

// Node runtime (default) — the Supabase SDK needs Node. No `runtime` export
// (conflicts with cacheComponents).

const EDITABLE_PRODUCT_FIELDS = ["name", "brand", "category"];

const readSchema = z
  .object({
    name: z.string().nullable(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    date_raw: z.string().nullable().optional(),
    expires_on: z.string().nullable().optional(),
    name_confidence: z.number().nullable().optional(),
    date_confidence: z.number().nullable().optional(),
  })
  .nullable();

const saveRequestSchema = z.object({
  idempotencyKey: z.string().min(1).nullable().optional(),
  batch: batchInputSchema,
  read: readSchema.optional(),
  editedFields: z.array(z.string()).default([]),
});

function campusId(): string {
  return process.env.CAMPUS_ID ?? "campus-a";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_batch" }, { status: 400 });
  }

  const parsed = saveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_batch", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { idempotencyKey, batch, read, editedFields } = parsed.data;
  const campus = campusId();
  const receivedOn = todayInTz();

  // dont_track / doesnt_expire force a null date (R11.4/P6), defensively here too.
  const expiresOn = batch.dont_track || batch.doesnt_expire ? null : batch.expires_on;
  const normalizedBatch = { ...batch, expires_on: expiresOn };
  const arrivedExpired = computeArrivedExpired(expiresOn, receivedOn);

  const repo = getRepository();

  try {
    const saved = await repo.saveBatch({
      campusId: campus,
      idempotencyKey: idempotencyKey ?? null,
      receivedOn,
      batch: normalizedBatch,
      arrivedExpired,
      editedFields,
      read: read
        ? {
            model: process.env.VISION_MODEL ?? null,
            read_name: read.name,
            read_date_raw: read.date_raw ?? null,
            read_expires_on: read.expires_on ?? null,
            name_confidence: read.name_confidence ?? null,
            date_confidence: read.date_confidence ?? null,
          }
        : null,
    });

    // Remember a product correction when staff edited name/brand/category,
    // keyed by the ORIGINAL read's name+brand (UI9.1). Never stores dates.
    if (read && editedFields.some((f) => EDITABLE_PRODUCT_FIELDS.includes(f))) {
      const correction = diffCorrection(
        { name: read.name, brand: read.brand, category: read.category },
        saved.name,
        saved.brand,
        saved.category,
      );
      if (correction) {
        const key = correctionKey(read.name, read.brand);
        try {
          await repo.saveCorrection(campus, key, correction);
        } catch (err) {
          // A correction write failing must not fail the save.
          console.warn(
            `[items] saveCorrection failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    // Totals: existing batches for this product EXCLUDING the just-saved one,
    // grouped by final saved name+brand (UI10.6).
    const todayList = await repo.listBatches(campus, "today", receivedOn);
    const existing = todayList.filter((b) => b.id !== saved.id);
    const totals = inventoryTotals(existing, saved.name, saved.brand, saved.quantity);

    return NextResponse.json({
      batch: saved,
      totals,
      repository: repo.name,
    });
  } catch (err) {
    console.error(
      `[items] save failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = url.searchParams.get("since") ?? "today";
  const campus = campusId();
  const todayIso = todayInTz();
  const repo = getRepository();

  try {
    const items = await repo.listBatches(campus, since === "today" ? "today" : since, todayIso);
    return NextResponse.json({ repository: repo.name, campusId: campus, items });
  } catch (err) {
    console.error(
      `[items] list failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }
}
