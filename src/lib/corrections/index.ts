// Remembered fixes — product corrections (UI9). When staff correct a product's
// name/brand/category, we remember it keyed by the ORIGINAL AI read (normalized
// read name + brand), so the next identical read is prefilled. Dates are NEVER
// remembered (UI9.3): each batch has its own date.

export interface ProductCorrection {
  name: string | null;
  brand: string | null;
  category: string | null;
}

/**
 * Build the correction key from a name + brand (UI9.5): lowercase, trim, and
 * collapse internal whitespace, joined with "|". Used for BOTH storing
 * corrections (from the original read) and looking them up.
 */
export function correctionKey(name: string | null, brand: string | null): string {
  return `${normalize(name)}|${normalize(brand)}`;
}

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Given the original read and the final chosen values, return the correction to
 * store — but only if staff actually changed name, brand, or category. Returns
 * null when nothing relevant changed. NEVER includes any date field (UI9.3).
 */
export function diffCorrection(
  original: { name: string | null; brand: string | null; category: string | null },
  finalName: string | null,
  finalBrand: string | null,
  finalCategory: string | null,
): ProductCorrection | null {
  const nameChanged = normalize(finalName) !== normalize(original.name);
  const brandChanged = normalize(finalBrand) !== normalize(original.brand);
  const categoryChanged = normalize(finalCategory) !== normalize(original.category);
  if (!nameChanged && !brandChanged && !categoryChanged) return null;
  return { name: finalName, brand: finalBrand, category: finalCategory };
}
