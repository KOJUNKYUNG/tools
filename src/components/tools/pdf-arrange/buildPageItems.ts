import { PDFDocument } from "pdf-lib";
import type { PageItem } from "@/lib/pdf/pageItem";

export interface BuiltPages {
  items: PageItem[];
  /** Raw bytes per generated source file id (consumed by thumbnails + assembler). */
  sourceBytesById: Map<string, Uint8Array>;
  /** Names of files that could not be read (corrupt/encrypted PDFs). */
  failed: string[];
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Read uploaded files into the editor's page model. PDFs expand to one PageItem
 * per page; images become a single page. A corrupt/encrypted PDF is skipped (its
 * name collected in `failed`) so one bad file never aborts the whole upload.
 */
export async function buildPageItems(files: File[]): Promise<BuiltPages> {
  const items: PageItem[] = [];
  const sourceBytesById = new Map<string, Uint8Array>();
  const failed: string[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileId = crypto.randomUUID();

    if (isPdf(file)) {
      let count: number;
      try {
        const doc = await PDFDocument.load(bytes);
        count = doc.getPageCount();
      } catch {
        failed.push(file.name);
        continue;
      }
      sourceBytesById.set(fileId, bytes);
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
      sourceBytesById.set(fileId, bytes);
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

  return { items, sourceBytesById, failed };
}

/** Output base name = first uploaded file name without its extension. */
export function deriveBaseName(fileName: string | undefined): string {
  if (!fileName) return "output";
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  return base || "output";
}
