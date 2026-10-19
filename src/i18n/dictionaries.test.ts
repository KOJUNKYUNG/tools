import { describe, it, expect } from "vitest";
import en from "./dictionaries/en.json";
import ko from "./dictionaries/ko.json";

const HANGUL = /[\uac00-\ud7a3]/;

describe("common.errors", () => {
  it("has the same messages in both languages, none empty", () => {
    expect(Object.keys(en.common.errors).sort()).toEqual(Object.keys(ko.common.errors).sort());
    for (const message of [...Object.values(en.common.errors), ...Object.values(ko.common.errors)]) {
      expect(message.trim()).not.toBe("");
    }
  });
  it("shows no Korean on the English pages (#83)", () => {
    for (const message of Object.values(en.common.errors)) expect(message).not.toMatch(HANGUL);
  });
});
