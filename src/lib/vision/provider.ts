// VisionProvider abstraction (R6.1). Every provider (gemini, anthropic, mock)
// implements this one method and returns a LabelRead. Providers run only on the
// server (R5.12). Selection by env happens in index.ts.
import type { LabelRead } from "./schema";

export type ProviderName = "gemini" | "anthropic" | "mock";

/** "read" = the whole label; "date_only" = a close-up of just the date. */
export type ReadMode = "read" | "date_only";

export interface ReadOptions {
  mode?: ReadMode;
}

export interface VisionProvider {
  readonly name: ProviderName;
  /** Read one item's label from a base64 JPEG (no data: prefix). */
  readLabel(imageJpegBase64: string, options?: ReadOptions): Promise<LabelRead>;
}

/**
 * Thrown by a provider when the model refused, truncated, timed out, or
 * produced output that fails schema validation. The route maps this to
 * `{ status: "unreadable" }` (R5.7, R6.10) and never returns a 500 (R5.9).
 */
export class UnreadableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnreadableError";
  }
}

/** True for network/connection errors that justify one retry (R5.10). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof UnreadableError) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound") ||
    msg.includes("socket") ||
    msg.includes("timed out") ||
    msg.includes("etimedout")
  );
}
