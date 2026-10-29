import { describe, expect, it } from "vitest";
import { batchInputSchema, computeArrivedExpired } from "./schema";

const base = {
  name: "Tomato paste",
  brand: "Valley Farms",
  size_text: null,
  category: "Sauces/Pastes/Spread",
  category_group: null,
  quantity: 4,
  unit: "can",
  expires_on: "2026-10-26",
  date_type: "best_by",
  date_precision: "day" as const,
  date_source: "photo" as const,
  dont_track: false,
  doesnt_expire: false,
  perishable: false,
  source: null,
};

describe("batchInputSchema", () => {
  it("accepts a valid batch", () => {
    expect(batchInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects empty name", () => {
    expect(batchInputSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });
  it("rejects quantity out of 1..999", () => {
    expect(batchInputSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(batchInputSchema.safeParse({ ...base, quantity: 1000 }).success).toBe(false);
    expect(batchInputSchema.safeParse({ ...base, quantity: 2.5 }).success).toBe(false);
  });
  it("allows a null expiry (save without a date, UI16.3)", () => {
    expect(batchInputSchema.safeParse({ ...base, expires_on: null }).success).toBe(true);
  });
});

describe("computeArrivedExpired (R11.9)", () => {
  const received = "2026-10-24";
  it("true when expires_on is before received_on", () => {
    expect(computeArrivedExpired("2026-10-20", received)).toBe(true);
  });
  it("false when expires_on is on/after received_on", () => {
    expect(computeArrivedExpired("2026-10-24", received)).toBe(false);
    expect(computeArrivedExpired("2026-12-01", received)).toBe(false);
  });
  it("false when no expiry", () => {
    expect(computeArrivedExpired(null, received)).toBe(false);
  });
});
