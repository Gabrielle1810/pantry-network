// Unit resolution for the "Save N cans" button (UI5.8). The container comes
// from the AI read when available; otherwise a per-category fallback applies,
// and "item"/"items" is the final fallback.
import type { Container } from "@/lib/vision/schema";

/** Per-category default container when the read didn't give one. */
const CATEGORY_CONTAINER: Record<string, Container> = {
  "Canned Goods": "can",
  "Dried Pasta/Grains": "box",
  "Sauces/Pastes/Spread": "jar",
  "Dried/Canned Meats/Protein": "can",
  Cereal: "box",
  "Microwave cup/package": "pack",
  "Granola Bar/Cracker Snacks": "pack",
  "Fruit Cups/Pouches": "pack",
  "Drinks/Juice/Milk/Protein": "bottle",
  Baking: "bag",
  "Oils/Vinegar": "bottle",
  Spices: "jar",
  "Hygiene Items": "item",
};

/**
 * Resolve the singular unit for a draft: explicit container from the read, else
 * the category fallback, else "item". Never throws.
 */
export function resolveUnit(
  container: Container | null | undefined,
  category: string | null | undefined,
): string {
  if (container) return container;
  if (category && CATEGORY_CONTAINER[category]) return CATEGORY_CONTAINER[category];
  return "item";
}

/** Pluralize a unit for a count. Regular plurals only (our units are regular). */
export function pluralizeUnit(unit: string, count: number): string {
  if (count === 1) return unit;
  // "box" → "boxes"; others take a plain "s".
  if (unit.endsWith("x") || unit.endsWith("s") || unit.endsWith("ch") || unit.endsWith("sh")) {
    return `${unit}es`;
  }
  return `${unit}s`;
}
