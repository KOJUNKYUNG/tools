import { PDFDocument } from "pdf-lib";
import type { PageItem } from "@/lib/pdf/pageItem";

export interface BuiltPages {
  items: PageItem[];
  /** Raw bytes per generated source file id (consumed by thumbnails + assembler). */
  sourceBytesById: Map<string, Uint8Array>;
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Read uploaded files into the editor's page model. PDFs expand to one PageItem
 * per page; images become a single page. Corrupt/encrypted PDFs throw from
 * PDFDocument.load — the caller surfaces that as an upload error (Task 2.6).
 */
export async function buildPageItems(files: File[]): Promise<BuiltPages> {
  const items: PageItem[] = [];
  const sourceBytesById = new Map<string, Uint8Array>();

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileId = crypto.randomUUID();
    sourceBytesById.set(fileId, bytes);

    if (isPdf(file)) {
      const doc = await PDFDocument.load(bytes);
      const count = doc.getPageCount();
      for (let i = 0; i < count; i++) {
        items.push({
          id: crypto.randomUUID(),
          sourceFileId: fileId,
          sourceFileName: file.name,
          kind: "pdf",
          sourcePageIndex: i,
          rotation: 0,
          splitAfter: false,
          deleted: false,
        });
      }
    } else {
      items.push({
        id: crypto.randomUUID(),
        sourceFileId: fileId,
        sourceFileName: file.name,
        kind: "image",
        sourcePageIndex: 0,
        rotation: 0,
        splitAfter: false,
        deleted: false,
      });
    }
  }

  return { items, sourceBytesById };
}

/** Output base name = first uploaded file name without its extension. */
export function deriveBaseName(fileName: string | undefined): string {
  if (!fileName) return "output";
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base || "output";
}
