export type WatermarkMode = "number" | "watermark";

const SUFFIX: Record<WatermarkMode, string> = {
  number: "-numbered",
  watermark: "-watermarked",
};

/**
 * Build the download filename for the output PDF.
 * `"doc.pdf"` + number → `"doc-numbered.pdf"`; `""` → `"output-numbered.pdf"`.
 */
export function deriveOutputName(originalName: string, mode: WatermarkMode): string {
  const base = originalName
    ? originalName.toLowerCase().endsWith(".pdf")
      ? originalName.slice(0, -4)
      : originalName
    : "output";
  return `${base}${SUFFIX[mode]}.pdf`;
}
