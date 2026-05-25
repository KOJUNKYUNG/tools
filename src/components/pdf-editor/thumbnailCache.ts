// Lazy thumbnail rendering cache for the pdf-arrange editor.
//
// Rendering pdf pages with pdfjs is expensive, so we (1) render only when a card
// scrolls near the viewport (see useLazyThumbnail) and (2) cache results here at
// module scope so reorder / divider toggles / re-mounts never re-render a page.
//
// IMPORTANT: pdfjs `getDocument({ data })` may transfer the ArrayBuffer to its
// worker, detaching it. The same source bytes are reused by the pdf-lib
// assembler (assembleSections), so we hand pdfjs a COPY (`bytes.slice()`) and
// never let it touch the originals.

import type { PDFDocumentProxy } from "pdfjs-dist";
import { detectImageFormat } from "@/lib/pdf/assembleSections";
import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

const THUMB_WIDTH = 200;
const JPEG_QUALITY = 0.7;

/** pdfjs document proxies, one per source file id. */
const docCache = new Map<string, Promise<PDFDocumentProxy>>();
/** Rendered pdf page thumbnails (data URLs), keyed by file id + page index. */
const pdfThumbCache = new Map<string, string>();
/** Object URLs for image sources, keyed by file id (revoked on clear). */
const imageUrlCache = new Map<string, string>();

function pdfThumbKey(fileId: string, pageIndex: number): string {
  return `${fileId}:${pageIndex}`;
}

function getDoc(
  fileId: string,
  bytes: Uint8Array,
): Promise<PDFDocumentProxy> {
  let doc = docCache.get(fileId);
  if (!doc) {
    doc = (async () => {
      const pdfjsLib = await getPdfjsLib();
      // slice() → fresh buffer pdfjs may detach without harming the original.
      return pdfjsLib.getDocument({ data: bytes.slice(), ...pdfjsDocParams })
        .promise;
    })();
    docCache.set(fileId, doc);
  }
  return doc;
}

/** Render (or return cached) a pdf page thumbnail as a JPEG data URL. */
export async function renderPdfThumbnail(
  fileId: string,
  pageIndex: number,
  bytes: Uint8Array,
): Promise<string> {
  const key = pdfThumbKey(fileId, pageIndex);
  const cached = pdfThumbCache.get(key);
  if (cached) return cached;

  const doc = await getDoc(fileId, bytes);
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");

  await page.render({ canvas, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

  // Release the canvas backing store immediately.
  canvas.width = 0;
  canvas.height = 0;

  pdfThumbCache.set(key, dataUrl);
  return dataUrl;
}

/** Return (or create + cache) an object URL for an image source. */
export function getImageUrl(fileId: string, bytes: Uint8Array): string {
  const cached = imageUrlCache.get(fileId);
  if (cached) return cached;

  const mime = detectImageFormat(bytes) === "png" ? "image/png" : "image/jpeg";
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }),
  );
  imageUrlCache.set(fileId, url);
  return url;
}

/**
 * Drop every cached doc/thumbnail/object URL. Call when the editor unmounts or
 * the user clears files, so a new upload reusing an id can't read stale pages.
 */
export function clearThumbnailCache(): void {
  for (const doc of docCache.values()) {
    doc.then((d) => d.destroy()).catch(() => {});
  }
  for (const url of imageUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  docCache.clear();
  pdfThumbCache.clear();
  imageUrlCache.clear();
}
