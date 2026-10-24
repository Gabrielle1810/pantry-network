// Category taxonomy (R10.2, R10.3). The groups/values come verbatim from the
// brief. The vision system prompt's category list is generated from
// CATEGORY_VALUES here so the two can never drift (R6.11).
//
// This is the subset of src/lib/items needed by the recognition slice. The
// full ItemBatch type, zod schema, and computeArrivedExpired arrive in Task 5.

/** Groups → their taxonomy values, in the brief's order. */
export const CATEGORY_GROUPS = {
  "Meal Essentials": [
    "Canned Goods",
    "Dried Pasta/Grains",
    "Sauces/Pastes/Spread",
    "Dried/Canned Meats/Protein",
    "Cereal",
  ],
  "Microwavable/Instant Meal": ["Microwave cup/package"],
  "Grab & Go Snacks": ["Granola Bar/Cracker Snacks", "Fruit Cups/Pouches"],
  "Drinks & Beverages": ["Drinks/Juice/Milk/Protein"],
  "Other Pantry Staples": ["Baking", "Oils/Vinegar", "Spices"],
  "Hygiene Items": ["Hygiene Items"],
} as const;

export type CategoryGroup = keyof typeof CATEGORY_GROUPS;

/** The flat list of valid category values, in prompt order. */
export const CATEGORY_VALUES: readonly string[] = Object.values(
  CATEGORY_GROUPS,
).flat();

/** The value used when nothing in the taxonomy fits (R10.3). */
export const UNCATEGORIZED = "Uncategorized" as const;

// value (lowercased) → canonical value, for case-insensitive matching (R10.2).
const LOWER_TO_CANONICAL = new Map<string, string>(
  CATEGORY_VALUES.map((v) => [v.toLowerCase(), v]),
);

// value → its group, for stamping category_group on a draft/batch.
const VALUE_TO_GROUP = new Map<string, CategoryGroup>(
  (Object.entries(CATEGORY_GROUPS) as [CategoryGroup, readonly string[]][]).flatMap(
    ([group, values]) => values.map((v) => [v, group] as [string, CategoryGroup]),
  ),
);

/**
 * Normalize a raw category string to a taxonomy value or "Uncategorized"
 * (R10.2 case-insensitive, R10.3 unknown → Uncategorized, P5). Structured
 * outputs do not guarantee enum casing, so we match case-insensitively.
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return UNCATEGORIZED;
  return LOWER_TO_CANONICAL.get(raw.trim().toLowerCase()) ?? UNCATEGORIZED;
}

/** The group for a (already normalized) category value, or "Hygiene Items" group fallback. */
export function categoryGroup(value: string): CategoryGroup | null {
  return VALUE_TO_GROUP.get(value) ?? null;
}

/** Semicolon-joined category list for the system prompt (keeps prompt in sync). */
export const CATEGORY_LIST_FOR_PROMPT = CATEGORY_VALUES.join("; ");
