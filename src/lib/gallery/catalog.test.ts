import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { GALLERY_IMAGES } from "./catalog";

const publicDir = path.resolve(__dirname, "../../../public");
const onDisk = (url: string) => path.join(publicDir, url);

/** Gradients made before the gallery spec, kept at the size they were made. */
const LEGACY = new Set(["gradient-green", "gradient-red", "gradient-yellow"]);

describe("gallery catalog", () => {
  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the original is on disk at the spec's resolution",
    async (id, img) => {
      expect(existsSync(onDisk(img.url))).toBe(true);
      const meta = await sharp(onDisk(img.url)).metadata();
      const expected = LEGACY.has(id) ? [1920, 1080] : [2560, 1440];
      expect([meta.width, meta.height]).toEqual(expected);
      expect([img.width, img.height]).toEqual(expected);
    },
  );

  it.each([
    ["ko", ko],
    ["en", en],
  ] as const)("every image has a %s title", (_, dict) => {
    const titles: Record<string, string> = dict.tools["ppt-background"].page.gallery.titles;
    for (const img of GALLERY_IMAGES) expect(titles[img.id], img.id).toBeTruthy();
  });
});
