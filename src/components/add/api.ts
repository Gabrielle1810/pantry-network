// Client calls for Add stock. Thin I/O: maps HTTP responses onto the pure types
// in src/lib/intake. Both the phone flow and the typed form save through here.
import { summaryFromResponse, type SaveBody, type SavedSummary, type SaveResponse } from "@/lib/intake";
import type { LabelRead } from "@/lib/vision/schema";
import type { ProductCorrection } from "@/lib/corrections";

export type ReadResult =
  | { kind: "ok"; read: LabelRead; remembered: ProductCorrection | null; provider: string }
  | { kind: "unreadable"; provider: string }
  | { kind: "error"; message: string };

const SESSION_ENDED = "Your session ended. Enter the PIN again to keep going.";
const OFFLINE = "We couldn't reach the server. Check the connection and try again.";

export async function readLabel(imageBase64: string, mode: "read" | "date_only"): Promise<ReadResult> {
  try {
    const res = await fetch("/api/vision/read-label", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, mode }),
    });
    if (res.status === 401) return { kind: "error", message: SESSION_ENDED };
    if (!res.ok) return { kind: "error", message: "That photo didn't work. Try again, or type it instead." };
    const json = (await res.json()) as {
      status: string;
      provider?: string;
      read?: LabelRead;
      remembered?: ProductCorrection | null;
    };
    if (json.status === "ok" && json.read) {
      return { kind: "ok", read: json.read, remembered: json.remembered ?? null, provider: json.provider ?? "unknown" };
    }
    return { kind: "unreadable", provider: json.provider ?? "unknown" };
  } catch {
    return { kind: "error", message: OFFLINE };
  }
}

export async function saveStock(
  body: SaveBody,
): Promise<{ ok: true; summary: SavedSummary } | { ok: false; message: string }> {
  try {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { ok: false, message: SESSION_ENDED };
    if (!res.ok) {
      return {
        ok: false,
        message: res.status === 400 ? "Check the name and the amount, then try again." : "We couldn't save that. Try again.",
      };
    }
    return { ok: true, summary: summaryFromResponse((await res.json()) as SaveResponse) };
  } catch {
    return { ok: false, message: `${OFFLINE} The item is not saved yet.` };
  }
}

/** A fresh idempotency key for one save. */
export function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
