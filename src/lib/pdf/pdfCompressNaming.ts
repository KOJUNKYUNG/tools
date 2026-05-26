/**
 * Build a friendly download filename for a compressed PDF.
 *
 * - `"report.pdf"` → `"report-compressed.pdf"`
 * - `"report.PDF"` → `"report-compressed.pdf"` (extension lower-cased on output)
 * - `"no-ext"`     → `"no-ext-compressed.pdf"`
 * - `""`           → `"compressed.pdf"` (matches the pre-migration hardcoded value)
 * - `"a.b.pdf"`    → `"a.b-compressed.pdf"` (only the trailing `.pdf` is stripped)
 */
export function deriveCompressedName(originalName: string): string {
  if (!originalName) return "compressed.pdf";
  const lower = originalName.toLowerCase();
  const base = lower.endsWith(".pdf")
    ? originalName.slice(0, -4)
    : originalName;
  return `${base}-compressed.pdf`;
}
