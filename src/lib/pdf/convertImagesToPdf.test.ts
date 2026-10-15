import { describe, expect, it, vi } from "vitest";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
import type { Dictionary } from "@/i18n/config";
import en from "@/i18n/dictionaries/en.json";
import ko from "@/i18n/dictionaries/ko.json";
import { getErrorMessage } from "@/lib/errors";
import { convertImagesToPdf, type ImageLayout } from "./assembleSections";
import * as check from "./imageToPdfCheck";
import { imagePage as image, imageSources as sources } from "./testImages";

// The real checker by default; one test makes it report a violation.
vi.mock("./imageToPdfCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkImageToPdf: vi.fn(real.checkImageToPdf) };
});
const { checkImageToPdf } = await vi.importActual<typeof check>("./imageToPdfCheck");

const pages = [image("wide"), image("tall", 90), image("photo", 180), image("wide", 270)];

describe("convertImagesToPdf", () => {
  it.each<[string, ImageLayout]>([
    ["native layout", { mode: "native" }],
    ["A4", { mode: "fixed", widthPt: 595, heightPt: 842 }],
    ["custom size", { mode: "fixed", widthPt: 300, heightPt: 120 }],
  ])("%s: the output passes the full check", async (_, imageLayout) => {
    const src = sources();
    const output = await convertImagesToPdf({ pages, sourceBytesById: src, imageLayout });
    expect(await checkImageToPdf(src, { pages, imageLayout }, output, "full")).toEqual([]);
  });

  it("blocks a failing quick check with the corrupt-output error and image-to-pdf's hint", async () => {
    vi.mocked(check.checkImageToPdf).mockResolvedValueOnce([
      { property: "page-count", detail: "1 images → 0 pages" },
    ]);
    const err = await convertImagesToPdf({
      pages: [image("photo")],
      sourceBytesById: sources(),
      imageLayout: { mode: "native" },
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above.
    expect((err as Error).message).toMatch(/^CORRUPT_OUTPUT: image-to-pdf: page-count/);
    // JSON imports are typed by their literal shape; the app reads them as Dictionary.
    for (const dict of [ko, en] as Dictionary[]) {
      const hint = getImageToPdfLabels(dict).errorCorrupt;
      expect(hint).toBeTruthy();
      expect(getErrorMessage(err, { corruptOutputHint: hint }).message).toBe(hint);
    }
  });
});
