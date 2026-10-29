import { describe, expect, it } from "vitest";
import { correctionKey, diffCorrection } from "./index";
import type { LabelRead } from "@/lib/vision/schema";

describe("UI9 correctionKey", () => {
  it("is case-insensitive and whitespace-normalized", () => {
    expect(correctionKey("Tomato  Paste", "Valley Farms")).toBe(
      correctionKey("tomato paste", "VALLEY  FARMS"),
    );
  });
  it("includes both name and brand", () => {
    expect(correctionKey("Beans", "A")).not.toBe(correctionKey("Beans", "B"));
    expect(correctionKey(null, null)).toBe("|");
  });
});

const original: Pick<LabelRead, "name" | "brand" | "category"> = {
  name: "tomato pase", // misread
  brand: "valey farm",
  category: "Uncategorized",
};

describe("UI9 diffCorrection", () => {
  it("returns a correction when name/brand/category changed", () => {
    const c = diffCorrection(original, "Tomato paste", "Valley Farms", "Sauces/Pastes/Spread");
    expect(c).toEqual({ name: "Tomato paste", brand: "Valley Farms", category: "Sauces/Pastes/Spread" });
  });
  it("returns null when nothing relevant changed (ignoring case/space)", () => {
    expect(diffCorrection(original, "tomato pase", "VALEY FARM", "uncategorized")).toBeNull();
  });
  it("UI9.3 never includes a date field (type-level: shape has only name/brand/category)", () => {
    const c = diffCorrection(original, "Fixed", null, null);
    expect(Object.keys(c ?? {}).sort()).toEqual(["brand", "category", "name"]);
  });
});
