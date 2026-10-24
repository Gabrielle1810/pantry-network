// POST /api/vision/read-label (R5). Behind the PIN (enforced by middleware,
// re-checked here is unnecessary since the matcher covers /api/vision). Thin
// HTTP shell: validates the image, calls the configured provider with a 15s
// timeout and one network retry, applies the server-side date re-check, and
// fail-softs to { status: "unreadable" } on any vision problem. Never 500s for
// a vision issue (R5.9).
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getVisionProvider,
  isNetworkError,
  UnreadableError,
  type LabelRead,
} from "@/lib/vision";
import { applyServerRechecks } from "@/lib/vision/recheck";
import { isWithinUploadLimit } from "@/lib/image";

// Runs in the Node runtime (the default for route handlers), which the Gemini
// SDK needs. No explicit `runtime` export: it conflicts with cacheComponents.

const READ_TIMEOUT_MS = 15_000;

const requestSchema = z.object({
  imageBase64: z.string().min(1),
});

/** JPEG magic bytes: FF D8 FF. Decode just the first few bytes to check. */
function looksLikeJpeg(base64: string): boolean {
  // First 4 base64 chars encode the first 3 bytes; "/9j/" is FF D8 FF.
  return base64.startsWith("/9j/");
}

function decodedByteLength(base64: string): number {
  // Length of the decoded payload without actually allocating it twice.
  const len = base64.length;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

async function readWithTimeoutAndRetry(
  imageBase64: string,
): Promise<LabelRead> {
  const provider = getVisionProvider();

  async function attempt(): Promise<LabelRead> {
    return Promise.race([
      provider.readLabel(imageBase64),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new UnreadableError("vision timeout")), READ_TIMEOUT_MS),
      ),
    ]);
  }

  try {
    return await attempt();
  } catch (err) {
    // Retry once, and only on a network error (R5.10). Timeouts and schema
    // failures are not retried.
    if (isNetworkError(err)) {
      return attempt();
    }
    throw err;
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
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }
  const { imageBase64 } = parsed.data;

  // R5.2 / R5.3: reject non-JPEG or oversized before calling the provider.
  if (!looksLikeJpeg(imageBase64)) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }
  if (!isWithinUploadLimit(decodedByteLength(imageBase64))) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }

  const providerName = getVisionProvider().name;

  try {
    const raw = await readWithTimeoutAndRetry(imageBase64);
    const read = applyServerRechecks(raw); // R5.13 + category normalize
    return NextResponse.json({ status: "ok", provider: providerName, read });
  } catch (err) {
    // Any vision problem → fail soft (R5.7). Log server-side for debugging.
    console.warn(
      `[vision] read-label unreadable (provider=${providerName}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.json({ status: "unreadable", provider: providerName });
  }
}
