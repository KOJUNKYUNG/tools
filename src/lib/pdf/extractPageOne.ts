import { PDFDocument } from "pdf-lib";

/**
 * Extract page 1 from a PDF as a new 1-page PDF (bytes).
 *
 * Used for live compressed previews — running the WASM compressor on this
 * tiny subset is ~50× cheaper than running it on the whole document.
 *
 * The caller should pass a `.slice()` copy if the source bytes are reused
 * elsewhere (pdf-lib does NOT detach the buffer, but defense in depth).
 */
export async function extractPageOne(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes);
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [0]);
  out.addPage(page);
  return out.save();
}
