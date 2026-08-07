/**
 * Whether to run the faithful (whole-document) live compressed preview.
 *
 * The preview compresses the entire document on the main thread; above the
 * per-tool upload limit that becomes too heavy to run on every preset change,
 * so we fall back to the original preview + model estimate.
 */
export function shouldPreviewCompress(fileSize: number, limit: number): boolean {
  return fileSize <= limit;
}
