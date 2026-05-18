import { afterEach, describe, expect, it } from "vitest";
import {
  consumeStagedFiles,
  stageFiles,
  __resetHandoffForTests,
} from "./toolHandoff";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

afterEach(() => {
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
});
