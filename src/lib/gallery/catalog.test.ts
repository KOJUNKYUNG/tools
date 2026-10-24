import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { GALLERY_IMAGES } from "./catalog";
import { renderCredits } from "./credits";
import type { GalleryCategory } from "./types";

const publicDir = path.resolve(__dirname, "../../../public");
const onDisk = (url: string) => path.join(publicDir, url);

/** Gradients made before the gallery spec, kept at the size they were made. */
const LEGACY = new Set(["gradient-green", "gradient-red", "gradient-yellow"]);

const KB = 1024;
/** The spec's per-file ceiling for originals. */
const BUDGET: Record<GalleryCategory, number> = {
  gradient: 300 * KB,
  nature: 600 * KB,
  texture: 600 * KB,
  pattern: 20 * KB,
};

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

  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the original fits its category's byte budget and carries no metadata",
    async (_, img) => {
      const file = onDisk(img.url);
      expect(statSync(file).size).toBeLessThanOrEqual(BUDGET[img.category]);
      const meta = await sharp(file).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
    },
  );

  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the thumbnail is a 480 × 270 JPEG of at most 30 KB",
    async (_, img) => {
      const file = onDisk(img.thumbnailUrl);
      expect(existsSync(file)).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 480, 270]);
      expect(statSync(file).size).toBeLessThanOrEqual(30 * KB);
    },
  );

  it("CREDITS.md is the one the catalog writes, listing every CC0 original", () => {
    const credits = readFileSync(path.join(publicDir, "gallery", "CREDITS.md"), "utf8");
    expect(credits).toBe(renderCredits(GALLERY_IMAGES));
    for (const img of GALLERY_IMAGES) {
      if (img.source.kind === "cc0") expect(credits, img.id).toContain(img.source.url);
    }
  });

  it.each([
    ["ko", ko],
    ["en", en],
  ] as const)("every image has a %s title", (_, dict) => {
    const titles: Record<string, string> = dict.tools["ppt-background"].page.gallery.titles;
    for (const img of GALLERY_IMAGES) expect(titles[img.id], img.id).toBeTruthy();
  });
});
