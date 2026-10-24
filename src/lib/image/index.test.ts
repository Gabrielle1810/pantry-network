import { describe, expect, it } from "vitest";
import {
  computeTargetDimensions,
  isWithinUploadLimit,
  MAX_LONGEST_SIDE,
  MAX_UPLOAD_BYTES,
} from "./index";

// Pure image-prep tests (no canvas; the browser wrapper is verified manually).

describe("R4.1 computeTargetDimensions", () => {
  it("downscales an oversized landscape image, preserving aspect ratio", () => {
    const { width, height } = computeTargetDimensions(4000, 3000);
    expect(Math.max(width, height)).toBe(MAX_LONGEST_SIDE);
    expect(width).toBe(1280);
    expect(height).toBe(960); // 1280 * (3000/4000)
  });

  it("downscales an oversized portrait image on the longest side", () => {
    const { width, height } = computeTargetDimensions(3000, 4000);
    expect(Math.max(width, height)).toBe(MAX_LONGEST_SIDE);
    expect(height).toBe(1280);
    expect(width).toBe(960);
  });

  it("leaves an already-small image unchanged", () => {
    expect(computeTargetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("handles zero/negative dimensions without throwing", () => {
    expect(computeTargetDimensions(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("R4.6 isWithinUploadLimit", () => {
  it("accepts sizes at or below 2 MB", () => {
    expect(isWithinUploadLimit(0)).toBe(true);
    expect(isWithinUploadLimit(MAX_UPLOAD_BYTES)).toBe(true);
    expect(isWithinUploadLimit(500 * 1024)).toBe(true);
  });

  it("rejects sizes above 2 MB", () => {
    expect(isWithinUploadLimit(MAX_UPLOAD_BYTES + 1)).toBe(false);
  });
});
