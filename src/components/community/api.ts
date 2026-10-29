// Client call for the Community endpoint. Thin I/O only.
export type CommunityAction =
  | { action: "offer"; productId: string; qty: number; note: string | null; requestId: string | null }
  | { action: "withdraw"; offerId: string }
  | { action: "request"; name: string; category: string; qty: number }
  | { action: "claim"; offerId: string; qty: number }
  | { action: "pickup"; pickupId: string };

export interface CommunityReply {
  ok: boolean;
  qty?: number;
  moved?: number;
  product?: { name: string; unit: string };
  before?: number;
  after?: number;
}

export async function postCommunity(body: CommunityAction): Promise<{ ok: boolean; message?: string; data: CommunityReply }> {
  try {
    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { ok: false, message: "Your session ended. Enter the PIN again.", data: { ok: false } };
    const data = (await res.json().catch(() => ({ ok: false }))) as CommunityReply;
    if (res.status === 409) return { ok: false, message: "That's no longer available. The list has been refreshed.", data };
    if (!res.ok || !data.ok) return { ok: false, message: "That didn't go through. Try again.", data };
    return { ok: true, data };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check the connection and try again.", data: { ok: false } };
  }
}
