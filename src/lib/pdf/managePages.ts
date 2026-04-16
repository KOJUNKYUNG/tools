import { PDFDocument, degrees } from "pdf-lib";

async function getPdfjsLib() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  return pdfjsLib;
}

export interface PageInfo {
  id: string;
  index: number;
  rotation: number;
  deleted: boolean;
  thumbnail: string;
}

export async function generateThumbnails(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<PageInfo[]> {
  const pdfjsLib = await getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
  }).promise;

  const totalPages = pdf.numPages;
  const pages: PageInfo[] = [];
  const THUMB_WIDTH = 200;

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const scale = THUMB_WIDTH / vp.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvas, viewport }).promise;
    const thumbnail = canvas.toDataURL("image/jpeg", 0.7);

    canvas.width = 0;
    canvas.height = 0;

    pages.push({
      id: `page-${i}`,
      index: i - 1,
      rotation: 0,
      deleted: false,
      thumbnail,
    });

    onProgress?.(Math.round((i / totalPages) * 100));
  }

  return pages;
}

export interface RebuildPdfOptions {
  file: File;
  pages: PageInfo[];
  onProgress?: (pct: number) => void;
}

export async function rebuildPdf({
  file,
  pages,
  onProgress,
}: RebuildPdfOptions): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = await PDFDocument.load(bytes);
  const newDoc = await PDFDocument.create();

  const activePages = pages.filter((p) => !p.deleted);
  if (activePages.length === 0) throw new Error("최소 1페이지 이상 필요합니다.");

  const indices = activePages.map((p) => p.index);
  const copiedPages = await newDoc.copyPages(source, indices);

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const rotation = activePages[i].rotation;
    if (rotation !== 0) {
      const current = page.getRotation().angle;
      page.setRotation(degrees(current + rotation));
    }
    newDoc.addPage(page);
    onProgress?.(Math.round(((i + 1) / activePages.length) * 100));
  }

  return newDoc.save();
}
