import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeStagedFiles,
  stageFiles,
  __resetHandoffForTests,
  HANDOFF_TTL_MS,
  HANDOFF_MAX_BYTES,
} from "./toolHandoff";

function makeFile(name: string, sizeBytes = 1): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/png" });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  __resetHandoffForTests();
});

describe("toolHandoff", () => {
  it("returns null when nothing has been staged", () => {
    expect(consumeStagedFiles()).toBeNull();
  });

  it("returns the staged payload on first consume", () => {
    const f = makeFile("a.png");
    stageFiles([f], "image-resize");
    expect(consumeStagedFiles()).toEqual({ files: [f], source: "image-resize" });
  });

  it("clears the store after consume — second consume returns null", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    consumeStagedFiles();
    expect(consumeStagedFiles()).toBeNull();
  });

  it("overwrites the previous payload when stage is called twice", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    const b = makeFile("b.png");
    stageFiles([b], "ppt-background");
    expect(consumeStagedFiles()).toEqual({ files: [b], source: "ppt-background" });
  });

  it("drops a payload older than TTL on consume", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    vi.advanceTimersByTime(HANDOFF_TTL_MS + 1);
    expect(consumeStagedFiles()).toBeNull();
  });

  it("drops a stale payload when a new stage call arrives after TTL", () => {
    stageFiles([makeFile("old.png")], "image-resize");
    vi.advanceTimersByTime(HANDOFF_TTL_MS + 1);
    const fresh = makeFile("fresh.png");
    stageFiles([fresh], "ppt-background");
    expect(consumeStagedFiles()).toEqual({ files: [fresh], source: "ppt-background" });
  });

  it("refuses to stage when total bytes exceed HANDOFF_MAX_BYTES", () => {
    const huge = makeFile("huge.png", HANDOFF_MAX_BYTES + 1);
    stageFiles([huge], "image-resize");
    expect(consumeStagedFiles()).toBeNull();
  });
});
