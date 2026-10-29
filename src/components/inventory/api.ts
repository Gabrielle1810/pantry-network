// Client call for Inventory edits (drawer + Full sheet). Thin I/O only; the
// server decides what changed and writes the adjustment entries.
import type { ProductEdit } from "@/lib/inventory";
import { COMMUNITY_LABEL } from "@/lib/labels";

export interface EditReply {
  ok: boolean;
  status?: "saved" | "unchanged" | "not_found" | "conflict" | "reserved";
  changed?: string[];
  dateSkipped?: boolean;
  reserved?: number;
}

export async function postEdit(productId: string, edit: ProductEdit): Promise<{ ok: boolean; message?: string; data: EditReply }> {
  try {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", productId, edit }),
    });
    if (res.status === 401) return { ok: false, message: "Your session ended. Enter the PIN again.", data: { ok: false } };
    const data = (await res.json().catch(() => ({ ok: false }))) as EditReply;
    if (data.status === "conflict") {
      return { ok: false, message: "Another item already has this name and brand. Change one of them.", data };
    }
    if (data.status === "reserved") {
      const n = data.reserved ?? 0;
      return {
        ok: false,
        message: `${n} ${n === 1 ? "is" : "are"} set aside for a ${COMMUNITY_LABEL} offer. Enter at least ${n}, or withdraw the offer first.`,
        data,
      };
    }
    if (res.status === 404) return { ok: false, message: "This item is no longer here. The list has been refreshed.", data };
    if (res.status === 400) return { ok: false, message: "Check the values and try again.", data };
    if (!res.ok || !data.ok) return { ok: false, message: "That didn't save. Try again.", data };
    return { ok: true, data };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check the connection and try again.", data: { ok: false } };
  }
}
