// POST /api/seed — load (or reset) the SAMPLE data. Guarded: behind the staff
// PIN (middleware), POST only, sample data only.
//   {}               add anything missing; safe to run twice (idempotent)
//   { "reset": true } wipe the six sample campuses' data, then seed fresh
// Settings "Reset demo data" calls this with reset. With Supabase it writes to
// the database; without it, it re-seeds the in-memory repo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { seedSupabase } from "@/lib/db/seed-supabase";
import { resetMemoryAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";

const bodySchema = z.object({ reset: z.boolean().optional() });

export async function POST(request: Request) {
  let reset = false;
  try {
    const text = await request.text();
    if (text.trim()) {
      const parsed = bodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      reset = parsed.data.reset ?? false;
    }
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // The in-memory repo seeds itself; a reset just drops it so it re-seeds.
    if (reset) resetMemoryAppRepository();
    return NextResponse.json({ ok: true, repository: "memory", reset });
  }

  try {
    const result = await seedSupabase(url, key, todayInTz(), { reset });
    return NextResponse.json({ ok: true, repository: "supabase", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[seed] failed: ${message}`);
    return NextResponse.json(
      { error: "seed_failed", message, hint: "Make sure supabase/migrations 002, 003 and 004 have been run." },
      { status: 500 },
    );
  }
}
