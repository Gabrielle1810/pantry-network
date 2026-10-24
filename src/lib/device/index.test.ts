import { describe, expect, it } from "vitest";
import { detectPhone, PHONE_MAX_WIDTH } from "./index";

// PO.8: detectPhone is a pure truth table over (coarse pointer, viewport, camera).

describe("detectPhone", () => {
  it("true only when coarse pointer AND small viewport AND camera", () => {
    expect(detectPhone({ coarsePointer: true, viewportWidth: 390, hasCameraInput: true })).toBe(true);
  });
  it("false without a coarse pointer (a laptop with a touchscreen off)", () => {
    expect(detectPhone({ coarsePointer: false, viewportWidth: 390, hasCameraInput: true })).toBe(false);
  });
  it("false on a large viewport even with coarse pointer + camera (tablet/desktop)", () => {
    expect(detectPhone({ coarsePointer: true, viewportWidth: PHONE_MAX_WIDTH + 1, hasCameraInput: true })).toBe(false);
  });
  it("false without a camera", () => {
    expect(detectPhone({ coarsePointer: true, viewportWidth: 390, hasCameraInput: false })).toBe(false);
  });
  it("includes the boundary width", () => {
    expect(detectPhone({ coarsePointer: true, viewportWidth: PHONE_MAX_WIDTH, hasCameraInput: true })).toBe(true);
  });
});
