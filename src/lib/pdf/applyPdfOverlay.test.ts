import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import { applyOverlay, type OverlayOptions, type WatermarkOptions } from "./applyPdfOverlay";
import * as check from "./pdfWatermarkCheck";
import { JPEG_3x2, solidPng } from "./testImages";

// Text is rasterised on a browser canvas; Node gets a fixed image instead.
vi.mock("./renderTextToPng", () => import("./renderTextToPngNode"));

// The real checker by default; some tests make it report damage.
vi.mock("./pdfWatermarkCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPdfWatermark: vi.fn(real.checkPdfWatermark) };
});
const { checkPdfWatermark } = await vi.importActual<typeof check>("./pdfWatermarkCheck");
const mockedCheck = vi.mocked(check.checkPdfWatermark);
afterEach(() => mockedCheck.mockReset().mockImplementation(checkPdfWatermark));

async function input(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 4; i++) {
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

  it("returns the input untouched when no page is selected", async () => {
    const bytes = await input();
    expect(await run(bytes, watermark([]))).toEqual(bytes);
  });

  it("blocks an output the check rejects", async () => {
    mockedCheck.mockResolvedValue([{ property: "page-count", detail: "test" }]);
    await expect(run(await input(), numbers([1]))).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });
});
