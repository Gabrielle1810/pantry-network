// Client call for the manager Take-out endpoint. Thin I/O only.
import type { LineInput, ReasonCode } from "@/lib/takeout";

export type TakeoutAction =
  | { action: "record"; reason: ReasonCode; lines: LineInput[]; idempotencyKey: string }
  | { action: "fix"; groupId: string; lines: LineInput[] }
  | { action: "delete"; groupId: string }
  | { action: "undo"; groupId: string | null; offerIds: string[] }
  | { action: "recount"; checkId: string; useCounted: boolean }
  | { action: "held"; heldId: string; accept: boolean };

export interface TakeoutReply {
  ok: boolean;
  status?: "recorded" | "duplicate" | "empty";
  groupId?: string | null;
  offerIds?: string[];
  lines?: { productId: string; name: string; qty: number }[];
  error?: string;
}

export async function postTakeout(body: TakeoutAction): Promise<{ ok: boolean; message?: string; data: TakeoutReply }> {
  try {
    const res = await fetch("/api/takeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { ok: false, message: "Your session ended. Enter the PIN again.", data: { ok: false } };
    const data = (await res.json().catch(() => ({ ok: false }))) as TakeoutReply;
    if (!res.ok) return { ok: false, message: "That didn't go through. Try again.", data };
    return { ok: data.ok !== false, data };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check the connection and try again.", data: { ok: false } };
  }
}
