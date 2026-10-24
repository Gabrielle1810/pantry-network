import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPin,
  constantTimeStringEqual,
  signSession,
  verifySession,
  SESSION_MAX_AGE_SECONDS,
} from "./index";

// R15.10 PIN-gate unit tests. No network, no real AI, no Next imports.

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.STAFF_PIN = "1234";
  process.env.SESSION_SECRET = "test-secret-not-derived-from-pin";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("R2.2/R2.5 checkPin", () => {
  it("accepts the correct PIN", () => {
    expect(checkPin("1234")).toBe(true);
  });

  it("R2.4 rejects a wrong PIN", () => {
    expect(checkPin("0000")).toBe(false);
    expect(checkPin("12345")).toBe(false);
    expect(checkPin("")).toBe(false);
  });

  it("rejects every PIN when STAFF_PIN is unset (fail closed)", () => {
    delete process.env.STAFF_PIN;
    expect(checkPin("1234")).toBe(false);
  });

  it("R2.5 constant-time compare returns a boolean for equal and unequal, same-length and different-length inputs", () => {
    // Exercises the constant-time path across the length-mismatch branch and
    // the byte-diff branch; both must resolve to a plain boolean result.
    expect(constantTimeStringEqual("abc", "abc")).toBe(true);
    expect(constantTimeStringEqual("abc", "abd")).toBe(false);
    expect(constantTimeStringEqual("abc", "abcd")).toBe(false);
    expect(constantTimeStringEqual("", "")).toBe(true);
  });
});

describe("R2.3 signSession / verifySession", () => {
  it("a token signed now verifies as valid", async () => {
    const token = await signSession();
    expect(await verifySession(token)).toBe(true);
  });

  it("R2.3a the signing key is SESSION_SECRET, not STAFF_PIN: changing the PIN does not invalidate a token", async () => {
    const token = await signSession();
    process.env.STAFF_PIN = "9999"; // PIN rotated / shared publicly
    expect(await verifySession(token)).toBe(true);
  });

  it("a token signed with a different secret fails to verify", async () => {
    const token = await signSession();
    process.env.SESSION_SECRET = "a-completely-different-secret";
    expect(await verifySession(token)).toBe(false);
  });

  it("a tampered payload is rejected", async () => {
    const token = await signSession();
    const [payload, sig] = token.split(".");
    // Flip the payload but keep the old signature.
    const tampered = `${payload}x.${sig}`;
    expect(await verifySession(tampered)).toBe(false);
  });

  it("a tampered signature is rejected", async () => {
    const token = await signSession();
    const [payload] = token.split(".");
    const tampered = `${payload}.AAAA`;
    expect(await verifySession(tampered)).toBe(false);
  });

  it("an expired token is rejected", async () => {
    // Sign a token that expired an hour ago by signing "in the past".
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const token = await signSession(twoDaysAgo, SESSION_MAX_AGE_SECONDS);
    expect(await verifySession(token)).toBe(false);
  });

  it("verifies against an explicit 'now' at the expiry boundary", async () => {
    const now = 1_000_000;
    const token = await signSession(now, SESSION_MAX_AGE_SECONDS);
    const exp = now + SESSION_MAX_AGE_SECONDS;
    expect(await verifySession(token, exp - 1)).toBe(true); // before expiry
    expect(await verifySession(token, exp)).toBe(false); // at expiry (exp > now is false)
    expect(await verifySession(token, exp + 1)).toBe(false); // after expiry
  });

  it("rejects empty / malformed tokens without throwing", async () => {
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession(null)).toBe(false);
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("no-dot-here")).toBe(false);
    expect(await verifySession(".")).toBe(false);
    expect(await verifySession("abc.")).toBe(false);
    expect(await verifySession(".abc")).toBe(false);
  });

  it("returns false (never throws) when SESSION_SECRET is unset", async () => {
    const token = await signSession();
    delete process.env.SESSION_SECRET;
    expect(await verifySession(token)).toBe(false);
  });
});
