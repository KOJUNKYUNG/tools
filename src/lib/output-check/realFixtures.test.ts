import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findRealFixtures } from "./realFixtures";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "real-fixtures-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("findRealFixtures", () => {
  it("fails when the fixture folder is missing", () => {
    expect(() => findRealFixtures(path.join(dir, "absent"), [".pptx"])).toThrow(
      /fixture folder not found/,
    );
  });

  it("fails when no file in the folder applies to the tool", () => {
    writeFileSync(path.join(dir, "notes.pdf"), "");
    expect(() => findRealFixtures(dir, [".pptx"])).toThrow(/no \.pptx fixtures/);
  });

  it("finds applicable files in nested folders, matching extensions case-insensitively", () => {
    mkdirSync(path.join(dir, "decks"));
    writeFileSync(path.join(dir, "b.PPTX"), "");
    writeFileSync(path.join(dir, "decks", "a.pptx"), "");
    writeFileSync(path.join(dir, "photo.png"), "");

    const found = findRealFixtures(dir, [".pptx"]).map((f) => path.relative(dir, f));
    expect(found).toEqual(["b.PPTX", path.join("decks", "a.pptx")]);
  });
});
