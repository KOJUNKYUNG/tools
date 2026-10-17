import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";
import type { RenderedPage } from "./pdfToImageCheck";
import { PageConversionError, renderCheckedPage, type Resolution } from "./pdfToImagePage";
import { solidPng, stubBrowserDecoder } from "./testImages";

const good = (width: number, height: number): RenderedPage => ({
  blob: new Blob([solidPng(width, height).slice()]),
  width,
  height,
});

/** A render per attempt; an Error entry makes that attempt throw. */
function renders(...results: (RenderedPage | Error)[]) {
  return vi.fn(async (_resolution: Resolution) => {
    const next = results.shift();
    if (!next || next instanceof Error) throw next ?? new Error("no more renders");
    return next;
  });
}

describe("renderCheckedPage", () => {
  beforeEach(() => {
    stubBrowserDecoder();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hands back a good render at the requested resolution", async () => {
    const first = good(40, 30);
    const render = renders(first);
    await expect(renderCheckedPage(3, "image/png", render)).resolves.toBe(first.blob);
    expect(render.mock.calls).toEqual([["requested"]]);
  });

  it("retries a page whose render failed at a reduced resolution", async () => {
    const reduced = good(20, 15);
    const render = renders(new Error("Canvas → Blob 변환 실패"), reduced);
    await expect(renderCheckedPage(3, "image/png", render)).resolves.toBe(reduced.blob);
    expect(render.mock.calls).toEqual([["requested"], ["reduced"]]);
  });

  it("retries a page whose image came out wrong", async () => {
    const reduced = good(20, 15);
    const render = renders({ ...good(40, 29), height: 30 }, reduced);
    await expect(renderCheckedPage(3, "image/png", render)).resolves.toBe(reduced.blob);
  });

  it("stops with the page number when the retry fails too, never skipping it", async () => {
    const render = renders(new Error("first"), { blob: null, width: 20, height: 15 });
    const error = await renderCheckedPage(3, "image/png", render).catch((e: unknown) => e);
    if (!(error instanceof PageConversionError)) throw new Error(`expected PageConversionError, got ${error}`);
    expect(error.pageNumber).toBe(3);
    // Any other caller still gets the corrupt-output message.
    expect(error.message.startsWith(CORRUPT_OUTPUT_PREFIX)).toBe(true);
  });
});
