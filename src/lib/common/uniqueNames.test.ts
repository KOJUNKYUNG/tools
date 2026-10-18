import { describe, expect, it } from "vitest";
import { uniqueNames } from "./uniqueNames";

describe("uniqueNames", () => {
  it("keeps distinct names and numbers repeats in order", () => {
    expect(uniqueNames(["a.jpg", "b.jpg", "a.jpg", "a.jpg"])).toEqual([
      "a.jpg",
      "b.jpg",
      "a (2).jpg",
      "a (3).jpg",
    ]);
  });

  it("treats names that differ only in case as repeats: Windows and macOS would overwrite one", () => {
    expect(uniqueNames(["IMG_0001.jpg", "img_0001.jpg", "Img_0001.JPG"])).toEqual([
      "IMG_0001.jpg",
      "img_0001 (2).jpg",
      "Img_0001 (3).JPG",
    ]);
  });

  it("never reuses a name an earlier input already holds", () => {
    expect(uniqueNames(["a.jpg", "a (2).jpg", "a.jpg"])).toEqual(["a.jpg", "a (2).jpg", "a (3).jpg"]);
  });
});
