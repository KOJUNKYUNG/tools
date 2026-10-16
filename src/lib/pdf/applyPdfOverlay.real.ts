// Real-file regression set entry for pdf-watermark (`pnpm test:real`).
import { vi } from "vitest";
import { inspectPdf } from "@/lib/output-check/pdfInspector";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import {
  applyOverlay,
  type OverlayOptions,
  type PageNumberOptions,
  type WatermarkOptions,
} from "./applyPdfOverlay";
import { checkPdfWatermark } from "./pdfWatermarkCheck";
import { JPEG_3x2, solidPng } from "./testImages";

// Text is rasterised on a browser canvas; Node gets a fixed image instead.
vi.mock("./renderTextToPng", () => import("./renderTextToPngNode"));

// The tool's defaults (PdfWatermark.tsx), with every page selected.
const numbers = (pages: number[], over: Partial<PageNumberOptions> = {}): PageNumberOptions => ({
  mode: "number",
  format: "plain",
  suffix: "쪽",
  start: 1,
  grid: "bottom-center",
  fontPx: 12,
  color: "#444444",
  margin: 24,
  position: null,
  pages,
  ...over,
});

const watermark = (pages: number[], over: Partial<WatermarkOptions> = {}): WatermarkOptions => ({
  mode: "watermark",
  source: "text",
  text: "대외비 CONFIDENTIAL",
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

async function requests(input: Uint8Array): Promise<RealFileRequest<OverlayOptions>[]> {
  // The tool cannot open an encrypted PDF: nothing to run.
  const pageCount = await inspectPdf(input, async (i) =>
    i.status === "open" && !(await i.pdf.encrypted()) ? i.pdf.pageCount : null,
  );
  if (pageCount === null) return [];
  const all = Array.from({ length: pageCount }, (_, i) => i + 1);
  const odd = all.filter((n) => n % 2 === 1);
  const even = all.filter((n) => n % 2 === 0);
  return [
    { label: "page numbers, all pages (default)", request: numbers(all) },
    { label: "page numbers, fraction, odd pages", request: numbers(odd, { format: "fraction" }) },
    { label: "text watermark, all pages (default)", request: watermark(all) },
    { label: "tiled text watermark, even pages", request: watermark(even, { tile: true }) },
    {
      label: "PNG logo, first page",
      request: watermark([1], { source: "image", logo: { bytes: solidPng(400, 200), kind: "png" } }),
    },
    {
      label: "JPEG logo, tiled, all pages",
      request: watermark(all, {
        source: "image",
        logo: { bytes: JPEG_3x2, kind: "jpg" },
        tile: true,
        logoScale: 0.2,
      }),
    },
  ];
}

realFileSuite<OverlayOptions, Uint8Array>({
  tool: "pdf-watermark",
  extensions: [".pdf"],
  requests,
  run: async (bytes, options) =>
    (await applyOverlay({ file: new File([bytes.slice()], "in.pdf"), options })).data,
  check: checkPdfWatermark,
});
