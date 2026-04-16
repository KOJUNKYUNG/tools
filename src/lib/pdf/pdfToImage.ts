async function getPdfjsLib() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  return pdfjsLib;
}

export type OutputFormat = "image/jpeg" | "image/png";
export type DpiOption = 72 | 150 | 300;

export interface PdfToImageOptions {
  file: File;
  format: OutputFormat;
  dpi: DpiOption;
  onProgress?: (pct: number) => void;
}

export interface ConvertedImage {
  name: string;
  blob: Blob;
}

const PDF_BASE_DPI = 72;

export async function pdfToImages({
  file,
  format,
  dpi,
  onProgress,
}: PdfToImageOptions): Promise<ConvertedImage[]> {
  const pdfjsLib = await getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
  }).promise;

  const totalPages = pdf.numPages;
  const scale = dpi / PDF_BASE_DPI;
  const ext = format === "image/png" ? "png" : "jpg";
  const quality = format === "image/jpeg" ? 0.92 : undefined;
  const images: ConvertedImage[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvas, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas → Blob 변환 실패"))),
        format,
        quality,
      );
    });

    images.push({
      name: `page-${String(i).padStart(3, "0")}.${ext}`,
      blob,
    });

    canvas.width = 0;
    canvas.height = 0;

    onProgress?.(Math.round((i / totalPages) * 100));
  }

  return images;
}
