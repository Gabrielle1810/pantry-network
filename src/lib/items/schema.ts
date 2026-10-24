// ItemBatch data contract (UI13.1). The saved unit of inventory: one row per
// delivery batch. Validated with zod on POST /api/items before persisting.
import { z } from "zod";
import { CONTAINERS } from "@/lib/vision/schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DATE_SOURCES = ["photo", "typed", "imported", "estimated"] as const;
export const DELIVERY_SOURCES = ["donated", "purchased"] as const;

/** Fields the client sends to save a batch (before the server stamps id/campus/etc). */
export const batchInputSchema = z.object({
  name: z.string().trim().min(1),
  brand: z.string().nullable(),
  size_text: z.string().nullable(),
  category: z.string(),
  category_group: z.string().nullable(),
  quantity: z.number().int().min(1).max(999),
  unit: z.enum(CONTAINERS).or(z.string()).default("item"),
  expires_on: z.string().regex(ISO_DATE).nullable(),
  date_type: z.string().nullable(),
  date_precision: z.enum(["day", "month"]).nullable(),
  date_source: z.enum(DATE_SOURCES).nullable(),
  dont_track: z.boolean(),
  doesnt_expire: z.boolean(),
  perishable: z.boolean(),
  source: z.enum(DELIVERY_SOURCES).nullable(),
});

export type BatchInput = z.infer<typeof batchInputSchema>;

/** A persisted batch as returned by the repository and the API. */
export interface ItemBatch {
  id: string;
  campus_id: string;
  idempotency_key: string | null;
  name: string;
  brand: string | null;
  size_text: string | null;
  category: string;
  category_group: string | null;
  quantity: number;
  unit: string;
  received_on: string; // ISO date in CAMPUS_TZ
  expires_on: string | null;
  date_type: string | null;
  date_precision: string | null;
  date_source: string | null;
  dont_track: boolean;
  doesnt_expire: boolean;
  perishable: boolean;
  arrived_expired: boolean;
  source: string | null;
  edited_fields: string[];
  created_at: string;
}

/**
 * arrived_expired is true exactly when expires_on is non-null and strictly
 * before received_on (both ISO dates, campus tz) (R11.9/P9).
 */
export function computeArrivedExpired(
  expiresOn: string | null,
  receivedOn: string,
): boolean {
  if (!expiresOn) return false;
  return expiresOn < receivedOn; // ISO date strings compare lexicographically
}
