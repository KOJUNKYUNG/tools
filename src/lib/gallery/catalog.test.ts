import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { GALLERY_IMAGES } from "./catalog";
import { renderCredits } from "./credits";
import { controlsFor, isColourProp } from "./recipeEdit";
import { paperRecipe } from "./recipes";
import type { GalleryCategory } from "./types";

const publicDir = path.resolve(__dirname, "../../../public");
const onDisk = (url: string) => path.join(publicDir, url);

const recipes: { name: string; category?: string }[] = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../scripts/gallery/shaders.json"), "utf8"),
);

/** Paper's prop → uniform table (`scripts/gallery/extract-paper-props.mjs`). */
const paperProps: { shaders: Record<string, { props: Record<string, { kind: string; max?: number }> }> } = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../scripts/gallery/paper-props.json"), "utf8"),
);

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
    async (_, img) => {
      expect(existsSync(onDisk(img.url))).toBe(true);
      const meta = await sharp(onDisk(img.url)).metadata();
      expect([meta.width, meta.height]).toEqual([img.width, img.height]);
      expect(img.width * 9).toBe(img.height * 16);
      // Own pictures predate the gallery spec and stay at the size they were
      // made; Paper renders at 4K; a photo is 4K unless its source is smaller.
      if (img.source.kind === "own") expect(img.width).toBe(1920);
      else if (img.source.kind === "paper") expect(img.width).toBe(3840);
      else expect(img.width).toBeGreaterThanOrEqual(2560);
      expect(img.width).toBeLessThanOrEqual(3840);
    },
  );

  it.each(GALLERY_IMAGES.map((img) => [img.id, img] as const))(
    "%s: the original is in its extension's format, fits its category's byte budget and carries no metadata",
    async (_, img) => {
      const file = onDisk(img.url);
      expect(statSync(file).size).toBeLessThanOrEqual(BUDGET[img.category]);
      const meta = await sharp(file).metadata();
      expect(meta.format).toBe(img.format);
      expect(meta.space).toBe("srgb");
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
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

  it("every Paper-drawn image has the recipe of the same name, and every recipe is in the gallery", () => {
    const drawn = GALLERY_IMAGES.filter((img) => img.source.kind === "paper").map((img) => `${img.category}/${img.name}`);
    const recipeKeys = recipes.map((r) => `${r.category ?? "gradient"}/${r.name}`);
    expect(drawn.sort()).toEqual(recipeKeys.sort());
  });

  it("the app finds each Paper-drawn image's recipe, and reads its colours the way Paper's prop table does", () => {
    for (const img of GALLERY_IMAGES.filter((i) => i.source.kind === "paper")) {
      const recipe = paperRecipe(img.name);
      expect(recipe?.category ?? "gradient", img.id).toBe(img.category);
      const table = paperProps.shaders[recipe!.shader]?.props;
      expect(table, `${img.id}: ${recipe!.shader} in paper-props.json`).toBeDefined();
      for (const prop of Object.keys(recipe!)) {
        const kind = table[prop]?.kind;
        expect(isColourProp(prop), `${img.id}.${prop}`).toBe(kind === "color" || kind === "colors");
      }
    }
  });

  it("the colour list grows up to Paper's maximum for the shader, and never past 6", () => {
    for (const img of GALLERY_IMAGES.filter((i) => i.source.kind === "paper")) {
      const recipe = paperRecipe(img.name)!;
      const list = paperProps.shaders[recipe.shader].props.colors;
      const max = recipe.colors && list?.max ? Math.min(list.max, 6) : null;
      expect(controlsFor(recipe).maxColours, img.id).toBe(max);
    }
  });

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
