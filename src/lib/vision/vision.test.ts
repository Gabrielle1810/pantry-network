import { describe, expect, it } from "vitest";
import { labelReadSchema } from "./schema";
import { MockVisionProvider, MOCK_FIXTURES } from "./mock";
import { applyServerRechecks } from "./recheck";

// A few quick tests for the recognition slice (mock provider only; no network,
// no real AI). The full property tests (P2/P4/P5) arrive with Tasks 5-9.

describe("LabelRead schema", () => {
  it("every mock fixture is schema-valid", () => {
    for (const [key, fixture] of Object.entries(MOCK_FIXTURES)) {
      const result = labelReadSchema.safeParse(fixture);
      expect(result.success, `fixture ${key} should validate`).toBe(true);
    }
  });

  it("R5.7/P4 rejects output missing required fields", () => {
    expect(labelReadSchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("rejects a non-ISO expires_on", () => {
    const bad = { ...MOCK_FIXTURES.readable_can, expires_on: "June 2027" };
    expect(labelReadSchema.safeParse(bad).success).toBe(false);
  });

  it("MockVisionProvider returns schema-valid reads", async () => {
    const provider = new MockVisionProvider("readable_can");
    const read = await provider.readLabel("ignored");
    expect(labelReadSchema.safeParse(read).success).toBe(true);
    expect(read.name).toBe("Black beans, canned, 15 oz");
  });
});

describe("R5.13/P2 server-side ambiguity re-check", () => {
  it("overrides an AI-resolved date that is actually ambiguous back to null + candidates", () => {
    // Simulate an AI that WRONGLY auto-resolved an ambiguous numeric date.
    const aiResolved = {
      ...MOCK_FIXTURES.ambiguous_date,
      date_raw: "06/12/27",
      expires_on: "2027-06-12", // AI picked one reading
      date_ambiguous: false, // AI claimed it was unambiguous
      date_candidates: [],
    };
    const rechecked = applyServerRechecks(aiResolved);
    expect(rechecked.expires_on).toBeNull();
    expect(rechecked.date_ambiguous).toBe(true);
    // Month-first candidate first (R7.4): 06/12/27 → "2027-06-12" then "2027-12-06".
    expect(rechecked.date_candidates).toEqual(["2027-06-12", "2027-12-06"]);
  });

  it("leaves an unambiguous month-only date alone (keeps the AI's last-day value)", () => {
    const rechecked = applyServerRechecks(MOCK_FIXTURES.month_only);
    expect(rechecked.date_ambiguous).toBe(false);
    expect(rechecked.expires_on).toBe("2028-03-31");
  });

  it("R10.2/R10.3 normalizes category case-insensitively, unknown → Uncategorized", () => {
    const lower = applyServerRechecks({ ...MOCK_FIXTURES.readable_can, category: "canned goods" });
    expect(lower.category).toBe("Canned Goods");
    const unknown = applyServerRechecks({ ...MOCK_FIXTURES.readable_can, category: "Widgets" });
    expect(unknown.category).toBe("Uncategorized");
  });
});
