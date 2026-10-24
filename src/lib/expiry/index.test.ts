import { describe, expect, it } from "vitest";
import { expiryStatus, expiryChip } from "./index";

const TODAY = "2026-10-24";

describe("UI6 expiryStatus", () => {
  it("null date → none", () => {
    expect(expiryStatus(null, TODAY)).toEqual({ status: "none", days: null });
  });
  it("past date → expired", () => {
    expect(expiryStatus("2026-10-20", TODAY).status).toBe("expired");
  });
  it("today → today (0 days)", () => {
    expect(expiryStatus(TODAY, TODAY)).toEqual({ status: "today", days: 0 });
  });
  it("1..7 days → soon (7-day boundary)", () => {
    expect(expiryStatus("2026-10-25", TODAY)).toEqual({ status: "soon", days: 1 });
    expect(expiryStatus("2026-10-31", TODAY)).toEqual({ status: "soon", days: 7 });
  });
  it("8+ days → ok (boundary)", () => {
    expect(expiryStatus("2026-11-01", TODAY)).toEqual({ status: "ok", days: 8 });
  });
});

describe("UI6 expiryChip", () => {
  it("expired → red 'Date has passed'", () => {
    expect(expiryChip({ status: "expired", days: -4 })).toEqual({ text: "Date has passed", tone: "red" });
  });
  it("today → amber 'Expires today'", () => {
    expect(expiryChip({ status: "today", days: 0 })).toEqual({ text: "Expires today", tone: "amber" });
  });
  it("soon → amber with singular/plural day(s)", () => {
    expect(expiryChip({ status: "soon", days: 1 })).toEqual({ text: "Expires in 1 day", tone: "amber" });
    expect(expiryChip({ status: "soon", days: 2 })).toEqual({ text: "Expires in 2 days", tone: "amber" });
  });
  it("ok → neutral", () => {
    expect(expiryChip({ status: "ok", days: 30 })).toEqual({ text: "Expires in 30 days", tone: "neutral" });
  });
  it("none → amber 'No date found'", () => {
    expect(expiryChip({ status: "none", days: null })).toEqual({ text: "No date found", tone: "amber" });
  });
});
