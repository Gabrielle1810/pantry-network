// LabelRead data contract (R10.1). Every AI response is validated against this
// zod schema on the server before it is trusted. A JSON Schema export (derived
// from the same zod object) is handed to Gemini's structured-output config so
// the model is constrained to this shape (R6.6).
import { z } from "zod";

export const DATE_TYPES = [
  "use_by",
  "best_by",
  "sell_by",
  "unlabeled",
  "none",
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const labelReadSchema = z.object({
  name: z.string().nullable(),
  brand: z.string().nullable(),
  size_text: z.string().nullable(),
  // Kept as a free string here; normalized to a taxonomy value | "Uncategorized"
  // after parsing (R10.2/R10.3), since structured outputs don't guarantee casing.
  category: z.string(),
  is_food: z.boolean(),
  doesnt_expire: z.boolean(),
  perishable: z.boolean(),
  date_raw: z.string().nullable(),
  date_type: z.enum(DATE_TYPES),
  expires_on: z.string().regex(ISO_DATE).nullable(),
  date_precision: z.enum(["day", "month"]).nullable(),
  date_ambiguous: z.boolean(),
  date_candidates: z.array(z.string()),
  quantity_visible: z.number().int().nullable(),
  name_confidence: z.number().min(0).max(1),
  date_confidence: z.number().min(0).max(1),
  notes: z.string().nullable(),
});

export type LabelRead = z.infer<typeof labelReadSchema>;

/**
 * JSON Schema for the provider's structured-output config (R6.6). zod 4 exports
 * JSON Schema natively, so no extra dependency is needed. Gemini's
 * responseJsonSchema uses standard JSON Schema; "jsonSchema2020-12" target
 * keeps nullable unions as `type: [...]`/anyOf which Gemini accepts.
 */
export const LABEL_READ_JSON_SCHEMA = z.toJSONSchema(labelReadSchema, {
  target: "draft-2020-12",
});
