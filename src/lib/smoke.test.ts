import { describe, expect, it } from "vitest";

// Scaffold smoke test (Task 1): proves the Vitest + fast-check toolchain runs.
// Real behavioral tests live beside each src/lib module in later tasks.
describe("scaffold smoke", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
