// Category visual metadata (icon + swatch colors), ported from the prototype
// CATEGORIES map (PB.5). Icon names are Lucide icon ids used by lucide-react.
export interface CategoryMeta {
  group: string;
  icon: string;
  bg: string;
  fg: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  "Canned Goods": { group: "Meal Essentials", icon: "cylinder", bg: "#fdefe9", fg: "#b4532a" },
  "Dried Pasta/Grains": { group: "Meal Essentials", icon: "wheat", bg: "#f8f0e6", fg: "#8a5a2e" },
  "Sauces/Pastes/Spread": { group: "Meal Essentials", icon: "cooking-pot", bg: "#fceef1", fg: "#a83a55" },
  "Dried/Canned Meats/Protein": { group: "Meal Essentials", icon: "fish", bg: "#fdefe9", fg: "#b4532a" },
  Cereal: { group: "Meal Essentials", icon: "coffee", bg: "#fff5e0", fg: "#b7791f" },
  "Microwave cup/package": { group: "Microwavable/Instant Meal", icon: "soup", bg: "#e9f5f3", fg: "#2a7a70" },
  "Granola Bar/Cracker Snacks": { group: "Grab & Go Snacks", icon: "cookie", bg: "#f3edfa", fg: "#6b4fa0" },
  "Fruit Cups/Pouches": { group: "Grab & Go Snacks", icon: "apple", bg: "#eef7e9", fg: "#3e7a2e" },
  "Drinks/Juice/Milk/Protein": { group: "Drinks & Beverages", icon: "milk", bg: "#ecf2fc", fg: "#2f5ea8" },
  Baking: { group: "Other Pantry Staples", icon: "chef-hat", bg: "#f8f0e6", fg: "#8a5a2e" },
  "Oils/Vinegar": { group: "Other Pantry Staples", icon: "droplet", bg: "#fff5e0", fg: "#b7791f" },
  Spices: { group: "Other Pantry Staples", icon: "leaf", bg: "#eef7e9", fg: "#3e7a2e" },
  "Hygiene Items": { group: "Hygiene Items", icon: "spray-can", bg: "#ecf2fc", fg: "#2f5ea8" },
};

const FALLBACK: CategoryMeta = { group: "Other Pantry Staples", icon: "package", bg: "#f1f3f0", fg: "#4a5650" };

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] ?? FALLBACK;
}
