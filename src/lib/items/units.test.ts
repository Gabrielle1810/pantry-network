import { describe, expect, it } from "vitest";
import { resolveUnit, pluralizeUnit } from "./units";

describe("resolveUnit", () => {
  it("prefers the explicit container from the read", () => {
    expect(resolveUnit("jar", "Canned Goods")).toBe("jar");
  });
  it("falls back to the category default when container is null", () => {
    expect(resolveUnit(null, "Canned Goods")).toBe("can");
    expect(resolveUnit(null, "Cereal")).toBe("box");
  });
  it("falls back to 'item' for unknown category and no container", () => {
    expect(resolveUnit(null, "Whatever")).toBe("item");
    expect(resolveUnit(null, null)).toBe("item");
  });
});

describe("pluralizeUnit", () => {
  it("keeps singular for count 1", () => {
    expect(pluralizeUnit("can", 1)).toBe("can");
  });
  it("adds -s for regular units", () => {
    expect(pluralizeUnit("can", 4)).toBe("cans");
    expect(pluralizeUnit("item", 2)).toBe("items");
  });
  it("adds -es for box", () => {
    expect(pluralizeUnit("box", 3)).toBe("boxes");
  });
});
