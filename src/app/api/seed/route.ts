// POST /api/seed — load sample data into Supabase (Step 2). Guarded: behind the
// staff PIN (middleware), POST only, sample data only, idempotent. No-op-safe to
// run repeatedly; Settings "Reset demo data" (Step 6) reuses the same function.
// Returns the generated student tokens so you can open the student page / poster.
import { NextResponse } from "next/server";
import { seedSupabase } from "@/lib/db/seed-supabase";
import { todayInTz } from "@/lib/dates";

export async function POST() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Memory repo is already seeded in-process; seeding only applies to Supabase.
    return NextResponse.json(
      { error: "no_supabase", message: "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are not set; the in-memory repo is already seeded." },
      { status: 400 },
    );
  }
  try {
    const result = await seedSupabase(url, key, todayInTz());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[seed] failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { error: "seed_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
