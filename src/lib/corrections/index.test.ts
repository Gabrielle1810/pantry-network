import { describe, expect, it } from "vitest";
import { correctionKey, diffCorrection } from "./index";
import type { LabelRead } from "@/lib/vision/schema";

describe("UI9 correctionKey", () => {
  it("is case-insensitive and whitespace-normalized", () => {
    expect(correctionKey("Tomato  Paste", "Hunt's")).toBe(
      correctionKey("tomato paste", "HUNT'S"),
    );
  });
  it("includes both name and brand", () => {
    expect(correctionKey("Beans", "A")).not.toBe(correctionKey("Beans", "B"));
    expect(correctionKey(null, null)).toBe("|");
  });
});

const original: Pick<LabelRead, "name" | "brand" | "category"> = {
  name: "tomato pase", // misread
  brand: "hunts",
  category: "Uncategorized",
};

describe("UI9 diffCorrection", () => {
  it("returns a correction when name/brand/category changed", () => {
    const c = diffCorrection(original, "Tomato paste", "Hunt's", "Sauces/Pastes/Spread");
    expect(c).toEqual({ name: "Tomato paste", brand: "Hunt's", category: "Sauces/Pastes/Spread" });
  });
  it("returns null when nothing relevant changed (ignoring case/space)", () => {
    expect(diffCorrection(original, "tomato pase", "HUNTS", "uncategorized")).toBeNull();
  });
  it("UI9.3 never includes a date field (type-level: shape has only name/brand/category)", () => {
    const c = diffCorrection(original, "Fixed", null, null);
    expect(Object.keys(c ?? {}).sort()).toEqual(["brand", "category", "name"]);
  });
});
