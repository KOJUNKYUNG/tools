import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pdfjsDocParams } from "./pdfjs";

const pdfjsRoot = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const publicDir = path.join(process.cwd(), "public");
const folderUrls = Object.entries(pdfjsDocParams).flatMap(([key, value]) =>
  typeof value === "string" ? [[key, value] as const] : [],
);

describe("pdfjsDocParams", () => {
  // pdfjs fetches decoders, ICC profiles, CMaps and fonts from these folders
  // on demand; a folder left uncopied fails silently (blank images, no ICC).
  it.each(folderUrls)("%s points at a full self-hosted copy of pdfjs-dist's folder", (_, url) => {
    const folder = url.replace(/^\/pdfjs\//, "");
    expect(readdirSync(path.join(publicDir, url)).sort()).toEqual(
      readdirSync(path.join(pdfjsRoot, folder)).sort(),
    );
  });
});
