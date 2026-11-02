import { describe, it, expect } from "vitest";
import en from "./dictionaries/en.json";
import ko from "./dictionaries/ko.json";

const HANGUL = /[\uac00-\ud7a3]/;

describe.each(["errors", "runLines"] as const)("common.%s", (group) => {
  it("has the same messages in both languages, none empty", () => {
    expect(Object.keys(en.common[group]).sort()).toEqual(Object.keys(ko.common[group]).sort());
    for (const message of [...Object.values(en.common[group]), ...Object.values(ko.common[group])]) {
      expect(message.trim()).not.toBe("");
    }
  });
  it("shows no Korean on the English pages (#83)", () => {
    for (const message of Object.values(en.common[group])) expect(message).not.toMatch(HANGUL);
  });
});
