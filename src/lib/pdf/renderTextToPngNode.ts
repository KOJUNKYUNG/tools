// Test helper: renderTextToPng without a browser canvas.
//
// The real one rasterises text on a canvas with the app's web font, which
// Node lacks. This stand-in returns a grey PNG of about the size the real
// one would draw (4× supersampled), so engine tests run the same pdf-lib
// path. Use it with `vi.mock("./renderTextToPng", () => import("./renderTextToPngNode"))`.
import type { RenderedText, RenderTextOptions } from "./renderTextToPng";
import { solidPng } from "./testImages";

export async function renderTextToPng({ text, fontPx }: RenderTextOptions): Promise<RenderedText> {
  const width = Math.ceil(fontPx * 0.6 * text.length + fontPx / 2);
  const height = Math.ceil(fontPx * 1.5);
  return { bytes: solidPng(width * 4, height * 4), width, height };
}
