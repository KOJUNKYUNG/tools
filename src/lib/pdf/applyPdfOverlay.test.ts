import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CORRUPT_OUTPUT_PREFIX, INVALID_INPUT_PREFIX } from "@/lib/errors";
import { UnreadableLogoError, applyOverlay, type OverlayOptions, type WatermarkOptions } from "./applyPdfOverlay";
import * as check from "./pdfWatermarkCheck";
import { renderTextToPng } from "./renderTextToPng";
import {
  JPEG_3x2,
  PNG_KINDS,
  PNG_PAGE_OVERHEAD,
  firstPictureRgba,
  pngOfKind,
  solidPng,
  withDamagedImageData,
} from "./testImages";

// Text is rasterised on a browser canvas; Node gets a fixed image instead,
// which a test can replace.
vi.mock("./renderTextToPng", async () => {
  const node = await import("./renderTextToPngNode");
  return { renderTextToPng: vi.fn(node.renderTextToPng) };
});

// The real checker by default; some tests make it report damage.
vi.mock("./pdfWatermarkCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPdfWatermark: vi.fn(real.checkPdfWatermark) };
});
const { checkPdfWatermark } = await vi.importActual<typeof check>("./pdfWatermarkCheck");
const mockedCheck = vi.mocked(check.checkPdfWatermark);
afterEach(() => {
  mockedCheck.mockReset().mockImplementation(checkPdfWatermark);
  vi.restoreAllMocks();
});

async function input(pageCount = 4): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`page ${i + 1}`, { x: 10, y: 10, font });
    if (i === 1) page.setRotation(degrees(90));
  }
  return doc.save();
}

const fileOf = (bytes: Uint8Array) => new File([bytes.slice()], "in.pdf", { type: "application/pdf" });

const numbers = (pages: number[]): OverlayOptions => ({
  mode: "number",
  format: "fraction",
  suffix: "p",
  start: 1,
  grid: "bottom-center",
  fontPx: 12,
  color: "#444444",
  margin: 24,
  position: null,
  pages,
});

const watermark = (pages: number[], over: Partial<WatermarkOptions> = {}): WatermarkOptions => ({
  mode: "watermark",
  source: "text",
  text: "DRAFT",
  fontPx: 48,
  color: "#888888",
  logo: null,
  logoScale: 0.4,
  opacity: 0.3,
  angle: 45,
  tile: false,
  tileGap: 1,
  grid: "center",
  margin: 24,
  position: null,
  pages,
  ...over,
});

const run = async (bytes: Uint8Array, options: OverlayOptions) =>
  (await applyOverlay({ file: fileOf(bytes), options })).data;

describe("applyOverlay", () => {
  it("returns a marked file that passes the full check, in every mode", async () => {
    const bytes = await input();
    for (const options of [
      numbers([1, 2, 3, 4]),
      numbers([2, 3]),
      watermark([1, 2, 3, 4]),
      watermark([1, 3], { tile: true, tileGap: 0.5 }),
      watermark([2], { source: "image", logo: { bytes: solidPng(64, 32), kind: "png" } }),
      watermark([4], { source: "image", logo: { bytes: JPEG_3x2, kind: "jpg" } }),
    ]) {
      const output = await run(bytes, options);
      expect(output).not.toBe(bytes);
      expect(await checkPdfWatermark(bytes, options, output, "full")).toEqual([]);
    }
  });

  // A hidden tab runs timers once a second, later once a minute (#140). The
  // check runs in pdf.js's worker, whose own waits are not the page's.
  it("waits on no timer for a file of ordinary size", async () => {
    const bytes = await input(200);
    mockedCheck.mockResolvedValue([]);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    await run(bytes, numbers([1, 200]));

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it("returns the input untouched when no page is selected", async () => {
    const bytes = await input();
    expect(await run(bytes, watermark([]))).toEqual(bytes);
  });

  it("rejects a PDF with no pages as the user's file, not the tool's output", async () => {
    const empty = await (await PDFDocument.create()).save({ addDefaultPage: false });
    await expect(run(empty, numbers([1]))).rejects.toThrow(INVALID_INPUT_PREFIX);
  });

  const pngLogo = (bytes: Uint8Array) => watermark([1], { source: "image", logo: { bytes, kind: "png" } });

  it.each(PNG_KINDS)("a %s PNG logo: pdf.js reads back its pixels, transparency included", async (kind) => {
    const png = pngOfKind(kind);
    const output = await run(await input(1), pngLogo(png.bytes));
    expect(Buffer.from(await firstPictureRgba(output)).equals(Buffer.from(png.rgba))).toBe(true);
  });

  // pdf-lib's own embedPng grew PNGs (#178): the logo adds no more than its file.
  it.each(PNG_KINDS)("a %s PNG logo adds no more than the PNG plus a page's overhead", async (kind) => {
    const bytes = await input(1);
    const png = pngOfKind(kind).bytes;
    const output = await run(bytes, pngLogo(png));
    expect(output.byteLength).toBeLessThanOrEqual(bytes.byteLength + png.byteLength + PNG_PAGE_OVERHEAD);
  });

  // 15 s, as in convertImagesToPdf.test.ts: inflating damaged data is slow under Node.
  it.each<[string, (png: Uint8Array) => Uint8Array]>([
    ["its compressed image data damaged", withDamagedImageData],
    ["cut off mid-download", (png) => png.subarray(0, Math.floor(png.length * 0.6))],
  ])("a PNG logo with %s is refused as the user's damaged logo, not their PDF", async (_, damage) => {
    const logo = damage(pngOfKind("truecolour with alpha").bytes);
    await expect(run(await input(1), pngLogo(logo))).rejects.toBeInstanceOf(UnreadableLogoError);
  }, 15_000);

  it("a rendered label it cannot embed is the tool's fault, not the user's PDF", async () => {
    vi.mocked(renderTextToPng).mockResolvedValueOnce({ bytes: Uint8Array.from([1, 2, 3]), width: 3, height: 1 });
    const err = await run(await input(1), numbers([1])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // Narrowed by the assertion above.
    expect((err as Error).message).not.toMatch(new RegExp(`^${INVALID_INPUT_PREFIX}`));
  });

  it("blocks an output the check rejects", async () => {
    mockedCheck.mockResolvedValue([{ property: "page-count", detail: "test" }]);
    await expect(run(await input(), numbers([1]))).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });
});
