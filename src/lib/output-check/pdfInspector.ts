import type { PDFDocumentProxy, PDFWorker } from "pdfjs-dist";
import { getPdfjsLib, pdfjsDocParams } from "@/lib/pdf/pdfjs";

/**
 * PDF inspector: opens a PDF with pdfjs and answers the questions tool
 * checkers ask. pdf-lib, justpdf and qpdf write Ontab's PDFs, so pdfjs makes
 * this a cross-engine check (CONTEXT.md → Output correctness). Shared by
 * every PDF tool.
 *
 * pdfjs loads through an adapter: the browser one (default) reuses the app's
 * self-hosted worker setup; Node installs the legacy-build adapter
 * (`pdfjsNode.ts`) so the same checks run in tests.
 *
 * "Renders" means pdfjs builds the page's operator list: it parses the
 * content stream and loads its fonts and images, the step that fails on a
 * broken page. Painting the pixels needs a canvas, which Node lacks, and adds
 * nothing a viewer would refuse to show.
 */

type PdfjsLib = typeof import("pdfjs-dist");

export interface PdfjsAdapter {
  /** The pdfjs module plus the getDocument params its environment needs. */
  load(): Promise<{ lib: PdfjsLib; docParams: Record<string, unknown> }>;
}

const browserAdapter: PdfjsAdapter = {
  async load() {
    return { lib: await getPdfjsLib(), docParams: pdfjsDocParams };
  },
};

let adapter: PdfjsAdapter = browserAdapter;
// One worker for every inspection: pdfjs otherwise starts a new one per
// document, which costs more than the check itself on small files.
let sharedWorker: PDFWorker | null = null;

/** Swap the pdfjs environment (Node test setup installs the legacy build). */
export function setPdfjsAdapter(next: PdfjsAdapter): void {
  adapter = next;
  sharedWorker = null;
}

export interface PdfPageInfo {
  /** Clockwise page rotation, normalised to 0, 90, 180 or 270. */
  rotation: number;
  /** The unrotated visible page box (crop box within the media box), in pt. */
  width: number;
  height: number;
}

export interface PdfReport {
  pageCount: number;
  /** Whether the file carries an encryption dictionary. */
  encrypted(): Promise<boolean>;
  /** 1-based page number. Throws when the page does not load. */
  page(n: number): Promise<PdfPageInfo>;
  /**
   * Null when page `n`'s dictionary loads, otherwise why it does not. Far
   * cheaper than `renderError`, which also parses its content and resources.
   */
  loadError(n: number): Promise<string | null>;
  /** Null when page `n` renders, otherwise why it does not. */
  renderError(n: number): Promise<string | null>;
  /** Page `n`'s text, in content order. */
  text(n: number): Promise<string>;
  /** Whether page `n` paints at least one raster image. */
  drawsImage(n: number): Promise<boolean>;
}

export type PdfInspection =
  | { status: "open"; pdf: PdfReport }
  /** Encrypted with a user password, and none (or a wrong one) was given. */
  | { status: "password-required" }
  /** pdfjs rejects the file's structure: no viewer built on it opens it. */
  | { status: "unopenable"; detail: string };

/**
 * pdfjs exceptions that mean "this file is broken", not "pdfjs failed".
 * UnknownErrorException is left out on purpose: it is pdfjs's catch-all for
 * any worker fault, so it proves nothing about the file.
 */
const UNOPENABLE = new Set(["InvalidPDFException", "FormatError"]);

function errorText(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function report(doc: PDFDocumentProxy, lib: PdfjsLib): PdfReport {
  const imageOps = new Set<number>([
    lib.OPS.paintImageXObject,
    lib.OPS.paintInlineImageXObject,
    lib.OPS.paintImageXObjectRepeat,
    lib.OPS.paintInlineImageXObjectGroup,
    lib.OPS.paintImageMaskXObject,
  ]);
  return {
    pageCount: doc.numPages,
    async encrypted() {
      const { info } = await doc.getMetadata();
      // `info` is typed `object`; EncryptFilterName is set for any /Encrypt.
      return (info as { EncryptFilterName?: string | null }).EncryptFilterName != null;
    },
    async page(n) {
      const page = await doc.getPage(n);
      const [x0, y0, x1, y1] = page.view;
      return { rotation: page.rotate, width: x1 - x0, height: y1 - y0 };
    },
    async loadError(n) {
      try {
        await doc.getPage(n);
        return null;
      } catch (err) {
        return errorText(err);
      }
    },
    async renderError(n) {
      try {
        await (await doc.getPage(n)).getOperatorList();
        return null;
      } catch (err) {
        return errorText(err);
      }
    },
    async text(n) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      return items.map((item) => ("str" in item ? item.str : "")).join("");
    },
    async drawsImage(n) {
      const { fnArray } = await (await doc.getPage(n)).getOperatorList();
      return fnArray.some((op) => imageOps.has(op));
    },
  };
}

/**
 * Open `bytes` with pdfjs and hand the result to `read`; the document is
 * closed when `read` settles. The bytes are copied first: pdfjs transfers its
 * buffer to the worker, and the caller's output must stay intact.
 *
 * A broken file is reported, never thrown. A throw means the inspector itself
 * failed (pdfjs did not load), which a checker must not mistake for a defect.
 */
export async function inspectPdf<T>(
  bytes: Uint8Array,
  read: (inspection: PdfInspection) => Promise<T>,
  options: { password?: string } = {},
): Promise<T> {
  const { lib, docParams } = await adapter.load();
  const verbosity = lib.VerbosityLevel.ERRORS;
  sharedWorker ??= new lib.PDFWorker({ verbosity });

  let doc: PDFDocumentProxy;
  try {
    doc = await lib.getDocument({
      ...docParams,
      data: bytes.slice(),
      password: options.password,
      worker: sharedWorker,
      verbosity,
    }).promise;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") return read({ status: "password-required" });
    if (UNOPENABLE.has(name)) {
      return read({ status: "unopenable", detail: errorText(err) });
    }
    throw err;
  }

  try {
    return await read({ status: "open", pdf: report(doc, lib) });
  } finally {
    await doc.destroy();
  }
}
