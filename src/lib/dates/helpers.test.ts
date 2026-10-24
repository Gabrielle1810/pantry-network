import { describe, expect, it } from "vitest";
import { todayInTz, daysUntil } from "./index";

describe("daysUntil", () => {
  it("0 for same day, positive for future, negative for past", () => {
    expect(daysUntil("2026-10-24", "2026-10-24")).toBe(0);
    expect(daysUntil("2026-10-31", "2026-10-24")).toBe(7);
    expect(daysUntil("2026-10-20", "2026-10-24")).toBe(-4);
  });
  it("crosses month and year boundaries", () => {
    expect(daysUntil("2026-11-01", "2026-10-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });
  it("NaN for malformed input", () => {
    expect(Number.isNaN(daysUntil("nope", "2026-10-24"))).toBe(true);
  });
});

describe("todayInTz", () => {
  it("returns an ISO date for a fixed instant in a given zone", () => {
    // 2026-10-24T02:00:00Z is still Oct 23 in New York (UTC-4/-5).
    const instant = new Date("2026-10-24T02:00:00Z");
    expect(todayInTz("America/New_York", instant)).toBe("2026-10-23");
    expect(todayInTz("UTC", instant)).toBe("2026-10-24");
  });
  it("produces YYYY-MM-DD shape", () => {
    expect(todayInTz("America/New_York")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
