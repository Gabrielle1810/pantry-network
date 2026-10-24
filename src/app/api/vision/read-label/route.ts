// POST /api/vision/read-label (R5). Behind the PIN (middleware). Validates the
// image, calls the configured provider with a 25 s timeout and one network
// retry, applies the server-side date re-check, and fail-softs to
// { status: "unreadable" } on any vision problem — never a 500 for a vision
// issue (R5.9).
//
// mode "read" (default) reads the whole label and returns any remembered fix
// for that read on the active campus. mode "date_only" reads a close-up of just
// the date ("Photograph the date instead"); the client keeps only date fields.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  getVisionProvider,
  isNetworkError,
  UnreadableError,
  type LabelRead,
  type VisionProvider,
} from "@/lib/vision";
import type { ReadMode } from "@/lib/vision/provider";
import { applyServerRechecks } from "@/lib/vision/recheck";
import { isWithinUploadLimit } from "@/lib/image";
import { getAppRepository } from "@/lib/db";
import { todayInTz } from "@/lib/dates";
import { correctionKey, type ProductCorrection } from "@/lib/corrections";
import { ACTIVE_CAMPUS_COOKIE, activeCampusFrom } from "@/lib/campus/active";

// Node runtime (the default for route handlers); no `runtime` export because it
// conflicts with cacheComponents.

const READ_TIMEOUT_MS = 25_000; // UI14.2: raised for slower models

const requestSchema = z.object({
  imageBase64: z.string().min(1),
  mode: z.enum(["read", "date_only"]).default("read"),
});

/** JPEG magic bytes FF D8 FF encode to "/9j/" in base64. */
function looksLikeJpeg(base64: string): boolean {
  return base64.startsWith("/9j/");
}

function decodedByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UnreadableError("vision timeout")), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function readWithRetry(provider: VisionProvider, imageBase64: string, mode: ReadMode): Promise<LabelRead> {
  const attempt = () => withTimeout(provider.readLabel(imageBase64, { mode }), READ_TIMEOUT_MS);
  try {
    return await attempt();
  } catch (err) {
    // Retry once, and only on a network error (R5.10).
    if (isNetworkError(err)) return attempt();
    throw err;
  }
}

/** Remembered fix for this read on the active campus. Non-fatal. */
async function rememberedFor(read: LabelRead): Promise<ProductCorrection | null> {
  if (!read.name) return null;
  try {
    const jar = await cookies();
    const campusId = activeCampusFrom(jar.get(ACTIVE_CAMPUS_COOKIE)?.value);
    return await getAppRepository(todayInTz()).getCorrection(campusId, correctionKey(read.name, read.brand));
  } catch (err) {
    console.warn(`[vision] correction lookup failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_image" }, { status: 400 });
  const { imageBase64, mode } = parsed.data;

  // R5.2 / R5.3: reject non-JPEG or oversized before calling the provider.
  if (!looksLikeJpeg(imageBase64) || !isWithinUploadLimit(decodedByteLength(imageBase64))) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }

  const provider = getVisionProvider();
  try {
    const read = applyServerRechecks(await readWithRetry(provider, imageBase64, mode));
    const remembered = mode === "read" ? await rememberedFor(read) : null;
    return NextResponse.json({ status: "ok", provider: provider.name, mode, read, remembered });
  } catch (err) {
    console.warn(
      `[vision] read-label unreadable (provider=${provider.name}, mode=${mode}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ status: "unreadable", provider: provider.name, mode });
  }
}
