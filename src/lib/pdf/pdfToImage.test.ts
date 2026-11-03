import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversionJob } from "./buildConversionJobs";
import { pdfToImages, type PdfToImageOptions } from "./pdfToImage";
import { PageConversionError } from "./pdfToImagePage";
import { solidPng, stubBrowserDecoder } from "./testImages";

const WIDTH = 40;
const HEIGHT = 30;
const PAGE_BYTES = solidPng(WIDTH, HEIGHT).byteLength;

/** Pages (by 1-based number) the fake pdf.js cannot draw, at any resolution. */
const failingPages = new Set<number>();

vi.mock("./pdfToImageIntent", () => ({ pageIntent: async () => "print" }));
vi.mock("./pdfjs", () => ({
  pdfjsDocParams: {},
  getPdfjsLib: async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        destroy: () => {},
        getPage: async (pageNumber: number) => ({
          rotate: 0,
          // The planned size, whatever the scale, so each page is the same image.
          getViewport: () => ({ width: WIDTH, height: HEIGHT }),
          render: () => ({
            promise: failingPages.has(pageNumber) ? Promise.reject(new Error("no drawing")) : Promise.resolve(),
          }),
        }),
      }),
    }),
  }),
}));

function canvasStub() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({}),
    toBlob: (done: (blob: Blob) => void) => done(new Blob([solidPng(WIDTH, HEIGHT).slice()], { type: "image/png" })),
  };
}

function jobs(count: number): ConversionJob[] {
  return Array.from({ length: count }, (_, i) => ({
    sourceFileId: "a",
    sourceFileName: "report.pdf",
    sourcePageIndex: i,
    rotation: 0,
  }));
}

function convert(pageCount: number, partByteTarget: number) {
  const options: PdfToImageOptions = {
    jobs: jobs(pageCount),
    sourceBytesById: new Map([["a", new Uint8Array(1)]]),
    format: "image/png",
    dpi: 72,
    partByteTarget,
    needsScreen: (work) => work(),
  };
  return pdfToImages(options);
}

describe("pdfToImages", () => {
  let createElement: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    failingPages.clear();
    stubBrowserDecoder();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    createElement = vi.fn((_tag: string) => canvasStub());
    vi.stubGlobal("document", { createElement });
    vi.spyOn(URL, "createObjectURL");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Nothing but drawing touched the page: no link clicked, no file handed to the browser. */
  function expectNothingSaved() {
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(new Set(createElement.mock.calls.map(([tag]) => tag))).toEqual(new Set(["canvas"]));
  }

  it("delivers a run over the target as parts in its result, and saves nothing", async () => {
    const outcome = await convert(5, 2 * PAGE_BYTES);

    if (outcome.mode !== "parts") throw new Error(`expected parts, got ${outcome.mode}`);
    expect(outcome.parts.map((part) => part.map((image) => image.name))).toEqual([
      ["report-1.png", "report-2.png"],
      ["report-3.png", "report-4.png"],
      ["report-5.png"],
    ]);
    expectNothingSaved();
  });

  it("keeps a run under the target as one set of images", async () => {
    const outcome = await convert(3, 100 * PAGE_BYTES);

    if (outcome.mode !== "preview") throw new Error(`expected preview, got ${outcome.mode}`);
    expect(outcome.images.map((image) => image.name)).toEqual(["report-1.png", "report-2.png", "report-3.png"]);
    expectNothingSaved();
  });

  it("keeps a run that reaches the target only on its last page as one set", async () => {
    const outcome = await convert(2, 2 * PAGE_BYTES);
    expect(outcome.mode).toBe("preview");
  });

  it("ends a run past the target at a failed page, with nothing saved", async () => {
    failingPages.add(4);

    const error = await convert(5, 2 * PAGE_BYTES).catch((e: unknown) => e);

    if (!(error instanceof PageConversionError)) throw new Error(`expected PageConversionError, got ${error}`);
    expect(error.pageNumber).toBe(4);
    expectNothingSaved();
  });
});
