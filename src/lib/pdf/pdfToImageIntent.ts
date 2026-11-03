import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type PageIntent = "print" | "display";

/**
 * The intent to render `page` with for output. Print draws without waiting on
 * frames, so a run keeps moving while the user is off the screen (CONTEXT
 * "Leaving the screen"); display stops there. In pdf.js the two differ only in
 * which annotations they draw and in how layers read their print and view
 * settings, so print gives the display image when both lists of annotations
 * match and the document has no layers. Anything else, or a page that cannot be read
 * for this, keeps display: a run may pause, but its image must not change.
 * `pnpm check:leaving-screen --print-intent` compares the two on real files;
 * re-check it when bumping pdf.js.
 */
export async function pageIntent(doc: PDFDocumentProxy, page: PDFPageProxy): Promise<PageIntent> {
  const shownFor = async (intent: PageIntent) =>
    (await page.getAnnotations({ intent })).map((a: { id: string }) => a.id).sort().join();
  try {
    const layers = [...(await doc.getOptionalContentConfig())];
    if (layers.length > 0) return "display";
    return (await shownFor("display")) === (await shownFor("print")) ? "print" : "display";
  } catch {
    return "display";
  }
}
