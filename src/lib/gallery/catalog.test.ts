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

/** Photos whose source is under 4K at 16:9; kept at the source's size, never enlarged. */
const SMALLER_SOURCE = new Set(["nature-dordogne-meadow", "texture-grey-concrete"]);

const KB = 1024;
/**
 * Per-file ceiling for originals, set from the chosen set at 4K (2026-10-27):
 * a background is stored once per deck, and the largest picks were about
 * 380 KB (shader art) and 1.75 MB (detailed photos) at quality 90.
 */
const BUDGET: Record<GalleryCategory, number> = {
  gradient: 512 * KB,
  pattern: 512 * KB,
  nature: 2048 * KB,
  texture: 2048 * KB,
};

describe("gallery catalog", () => {
  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the original is on disk at its declared 16:9 size, 4K unless its source is smaller",
    async (id, img) => {
      expect(existsSync(onDisk(img.url))).toBe(true);
      const meta = await sharp(onDisk(img.url)).metadata();
      expect([meta.width, meta.height]).toEqual([img.width, img.height]);
      expect(img.width * 9).toBe(img.height * 16);
      if (LEGACY.has(id)) expect(img.width).toBe(1920);
      else if (!SMALLER_SOURCE.has(id)) expect(img.width).toBe(3840);
      else expect(img.width).toBeGreaterThanOrEqual(2560);
    },
  );

  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the original is in its extension's format, fits its category's byte budget and carries no metadata",
    async (_, img) => {
      const file = onDisk(img.url);
      expect(statSync(file).size).toBeLessThanOrEqual(BUDGET[img.category]);
      const meta = await sharp(file).metadata();
      expect(meta.format).toBe(img.url.endsWith(".png") ? "png" : "jpeg");
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
    },
  );

  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the thumbnail is a 480 × 270 JPEG of at most 40 KB",
    async (_, img) => {
      const file = onDisk(img.thumbnailUrl);
      expect(existsSync(file)).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 480, 270]);
      // 46 thumbnails came to 458 KB; only the most detailed passed 30 KB.
      expect(statSync(file).size).toBeLessThanOrEqual(40 * KB);
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
