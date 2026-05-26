export interface PdfAnalysis {
  pages: number;
  images: number;
  totalImageBytes: number;
  isEncrypted: boolean;
}

/**
 * Analyze a PDF without compressing it.
 *
 * Returns page count, image count, total image bytes, and encryption status.
 * Fast — no compression run.
 */
export async function analyzePdf(file: File): Promise<PdfAnalysis> {
  const mod = await import("@kihyun1998/justpdf-compress-wasm");
  const init = mod.default;
  const { analyze } = mod;
  await init();

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const result = analyze(bytes);
  const summary: PdfAnalysis = {
    pages: result.pages,
    images: result.images,
    totalImageBytes: result.total_image_bytes,
    isEncrypted: result.is_encrypted,
  };
  result.free();
  return summary;
}
