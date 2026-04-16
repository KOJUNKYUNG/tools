import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

export interface PageRange {
  start: number;
  end: number;
}

export function parsePageRanges(input: string, totalPages: number): PageRange[] {
  const ranges: PageRange[] = [];
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < 1 || end < start || end > totalPages) {
        throw new Error(`유효하지 않은 범위: "${part}" (전체 ${totalPages}페이지)`);
      }
      ranges.push({ start, end });
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page) || page < 1 || page > totalPages) {
        throw new Error(`유효하지 않은 페이지: "${part}" (전체 ${totalPages}페이지)`);
      }
      ranges.push({ start: page, end: page });
    }
  }

  if (ranges.length === 0) {
    throw new Error("페이지 범위를 입력해 주세요.");
  }

  return ranges;
}

export interface SplitPdfOptions {
  file: File;
  mode: "range" | "all";
  rangeInput?: string;
  onProgress?: (pct: number) => void;
}

export interface SplitResult {
  type: "single" | "zip";
  data: Uint8Array;
  filename: string;
}

export async function splitPdf({
  file,
  mode,
  rangeInput,
  onProgress,
}: SplitPdfOptions): Promise<SplitResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = await PDFDocument.load(bytes);
  const totalPages = source.getPageCount();
  onProgress?.(10);

  if (mode === "range") {
    if (!rangeInput?.trim()) throw new Error("페이지 범위를 입력해 주세요.");
    const ranges = parsePageRanges(rangeInput, totalPages);

    const indices: number[] = [];
    for (const r of ranges) {
      for (let i = r.start; i <= r.end; i++) {
        if (!indices.includes(i - 1)) indices.push(i - 1);
      }
    }
    indices.sort((a, b) => a - b);

    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(source, indices);
    for (const page of pages) newDoc.addPage(page);
    onProgress?.(80);

    const data = await newDoc.save();
    onProgress?.(100);
    return { type: "single", data, filename: "split.pdf" };
  }

  const zip = new JSZip();
  for (let i = 0; i < totalPages; i++) {
    const newDoc = await PDFDocument.create();
    const [page] = await newDoc.copyPages(source, [i]);
    newDoc.addPage(page);
    const data = await newDoc.save();
    zip.file(`page-${String(i + 1).padStart(3, "0")}.pdf`, data);
    onProgress?.(Math.round(((i + 1) / totalPages) * 90));
  }

  const zipData = await zip.generateAsync({ type: "uint8array" });
  onProgress?.(100);
  return { type: "zip", data: zipData, filename: "split-pages.zip" };
}
