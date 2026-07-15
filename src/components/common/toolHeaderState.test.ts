// src/components/common/toolHeaderState.test.ts
import { describe, it, expect } from "vitest";
import { derivePrimaryState } from "./toolHeaderState";

describe("derivePrimaryState", () => {
  it("returns null when no file is loaded (header shows description only)", () => {
    expect(derivePrimaryState({ hasFile: false, status: "idle" })).toBeNull();
  });
  it("returns 'execute' when a file is loaded and idle", () => {
    expect(derivePrimaryState({ hasFile: true, status: "idle" })).toBe("execute");
  });
  it("returns 'processing' while running", () => {
    expect(derivePrimaryState({ hasFile: true, status: "processing" })).toBe("processing");
  });
  it("returns 'again' when done", () => {
    expect(derivePrimaryState({ hasFile: true, status: "done" })).toBe("again");
  });
  it("returns 'execute' on error so the user can re-run", () => {
    expect(derivePrimaryState({ hasFile: true, status: "error" })).toBe("execute");
  });
});
