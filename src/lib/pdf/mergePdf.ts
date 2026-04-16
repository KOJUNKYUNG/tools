import { PDFDocument } from "pdf-lib";

export interface MergePdfOptions {
  files: File[];
  onProgress?: (pct: number) => void;
}

export async function mergePdfs({
  files,
  onProgress,
}: MergePdfOptions): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const bytes = new Uint8Array(await files[i].arrayBuffer());
    const donor = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(donor, donor.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return merged.save();
}
