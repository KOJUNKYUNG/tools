import { PDFDocument } from "pdf-lib";

export interface ImageToPdfOptions {
  files: File[];
  onProgress?: (pct: number) => void;
}

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export async function imagesToPdf({
  files,
  onProgress,
}: ImageToPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const bytes = await readFileAsUint8Array(file);
    const type = file.type;

    let image;
    if (type === "image/png") {
      image = await pdf.embedPng(bytes);
    } else {
      image = await pdf.embedJpg(bytes);
    }

    const { width, height } = image.scale(1);
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });

    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return pdf.save();
}
