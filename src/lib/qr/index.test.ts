import { describe, expect, it } from "vitest";
import { qrSvg, studentUrl } from "./index";

describe("studentUrl", () => {
  it("builds /s/<token> and tolerates a trailing slash on the origin", () => {
    expect(studentUrl("https://pantry.example/", "abc123")).toBe("https://pantry.example/s/abc123");
  });
});

describe("qrSvg", () => {
  it("returns a square module matrix as a path of 1x1 squares", () => {
    const qr = qrSvg("https://pantry.example/s/abc123");
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.path.startsWith("M")).toBe(true);
    expect(qr.path).toMatch(/^(M\d+ \d+h1v1h-1z)+$/); // only numbers and fixed commands
  });
  it("encodes different links differently", () => {
    expect(qrSvg("https://a.example/s/1").path).not.toBe(qrSvg("https://a.example/s/2").path);
  });
});
