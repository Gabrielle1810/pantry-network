// POST /api/items — save one delivery batch for the ACTIVE campus (Step 3).
// Same endpoint for the phone camera flow and the typed form. Creates or reuses
// the product by product_key and adds an item_batch, so the stock shows in
// Inventory right away. Idempotent by idempotencyKey. When staff corrected
// name/brand/category, remembers the fix keyed by the original read (never
// dates). Session enforced by middleware. Persistence errors are not fail-soft.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAppRepository } from "@/lib/db";
import { batchInputSchema, computeArrivedExpired } from "@/lib/items/schema";
import { categoryGroup } from "@/lib/items/taxonomy";
import { todayInTz } from "@/lib/dates";
import { correctionKey, diffCorrection } from "@/lib/corrections";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";

const PRODUCT_FIELDS = ["name", "brand", "category"];

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_batch" }, { status: 400 });
  }
  const parsed = saveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_batch", details: parsed.error.issues }, { status: 400 });
  }

  const { idempotencyKey, batch, read, editedFields } = parsed.data;
  const jar = await cookies();
  const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
  const receivedOn = todayInTz();
  const repo = getAppRepository(receivedOn);

  // dont_track / doesnt_expire force a null date (R11.4/P6).
  const expiresOn = batch.dont_track || batch.doesnt_expire ? null : batch.expires_on;

  try {
    const result = await repo.saveIntake({
      campusId,
      idempotencyKey: idempotencyKey ?? null,
      receivedOn,
      product: {
        name: batch.name,
        brand: batch.brand,
        sizeText: batch.size_text,
        category: batch.category,
        categoryGroup: batch.category_group ?? categoryGroup(batch.category),
        unit: batch.unit,
        noExpire: batch.doesnt_expire,
        source: batch.source,
      },
      quantity: batch.quantity,
      expiresOn,
      dateType: expiresOn ? batch.date_type : null,
      datePrecision: expiresOn ? batch.date_precision : null,
      dateSource: expiresOn ? batch.date_source : null,
      editedFields,
      read: read
        ? {
            model: process.env.VISION_MODEL ?? null,
            readName: read.name,
            readDateRaw: read.date_raw ?? null,
            readExpiresOn: read.expires_on ?? null,
            nameConfidence: read.name_confidence ?? null,
            dateConfidence: read.date_confidence ?? null,
          }
        : null,
    });

    // Remember the fix keyed by the ORIGINAL read (UI9.1). Never stores dates.
    if (read && !result.duplicate && editedFields.some((f) => PRODUCT_FIELDS.includes(f))) {
      const fix = diffCorrection(read, batch.name, batch.brand, batch.category);
      if (fix) {
        try {
          await repo.saveCorrection(campusId, correctionKey(read.name, read.brand), fix);
        } catch (err) {
          console.warn(`[items] saveCorrection failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return NextResponse.json({
      product: result.product,
      batch: {
        id: result.batch.id,
        productId: result.product.id,
        name: result.product.name,
        quantity: result.batch.quantity,
        unit: result.product.unit,
        received_on: result.batch.receivedOn,
        expires_on: result.batch.expiresOn,
        arrived_expired: computeArrivedExpired(result.batch.expiresOn, result.batch.receivedOn),
      },
      totals: result.totals,
      duplicate: result.duplicate,
      campusId,
      repository: repo.name,
    });
  } catch (err) {
    console.error(`[items] save failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
