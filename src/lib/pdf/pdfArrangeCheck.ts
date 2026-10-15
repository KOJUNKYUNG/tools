import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { inspectPdf, type PdfReport } from "@/lib/output-check/pdfInspector";
import type { PageItem } from "./pageItem";

/** Raw bytes per source file id: a PDF, or a PNG/JPEG for image pages. */
export type PdfArrangeSources = Map<string, Uint8Array>;

export interface PdfArrangeRequest {
  /** The output sections the user arranged, deleted pages already dropped. */
  sections: PageItem[][];
}

/** What a source page looks like to pdfjs; null when pdfjs cannot load it. */
interface SourcePage {
  rotation: number;
  width: number;
  height: number;
  text: string;
}

const normalise = (deg: number) => ((deg % 360) + 360) % 360;

const isPng = (b: Uint8Array) =>
  b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Read every pdf page the sections use, one pdfjs open per source file. */
async function readSourcePages(
  sources: PdfArrangeSources,
  sections: PageItem[][],
): Promise<Map<string, SourcePage | null>> {
  const wanted = new Map<string, Set<number>>();
  for (const item of sections.flat()) {
    if (item.kind !== "pdf") continue;
    const pages = wanted.get(item.sourceFileId) ?? new Set<number>();
    pages.add(item.sourcePageIndex);
    wanted.set(item.sourceFileId, pages);
  }

  const facts = new Map<string, SourcePage | null>();
  for (const [id, pages] of wanted) {
    const bytes = sources.get(id);
    await inspectPdf(bytes ?? new Uint8Array(0), async (i) => {
      for (const index of pages) {
        const key = `${id}#${index}`;
        if (i.status !== "open" || index >= i.pdf.pageCount) {
          facts.set(key, null);
          continue;
        }
        const n = index + 1;
        if ((await i.pdf.renderError(n)) !== null) {
          facts.set(key, null);
          continue;
        }
        facts.set(key, { ...(await i.pdf.page(n)), text: await i.pdf.text(n) });
      }
    });
  }
  return facts;
}

/** Whether the source page behind `item` also fails to render in pdfjs. */
async function sourceFailsToo(sources: PdfArrangeSources, item: PageItem): Promise<boolean> {
  if (item.kind !== "pdf") return false;
  const bytes = sources.get(item.sourceFileId);
  if (!bytes) return false;
  return inspectPdf(bytes, async (i) => {
    if (i.status !== "open") return true;
    if (item.sourcePageIndex >= i.pdf.pageCount) return true;
    return (await i.pdf.renderError(item.sourcePageIndex + 1)) !== null;
  });
}

async function checkPages(
  pdf: PdfReport,
  section: PageItem[],
  file: number,
  sourcePages: Map<string, SourcePage | null>,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const pages = Math.min(section.length, pdf.pageCount);
  for (let j = 0; j < pages; j++) {
    const item = section[j];
    const at = `file ${file} page ${j + 1}`;
    const loadError = await pdf.loadError(j + 1);
    if (loadError !== null) {
      violations.push({ property: "page-identity", detail: `${at}: does not load: ${loadError}` });
      continue;
    }
    const out = await pdf.page(j + 1);

    let expectedRotation: number;
    if (item.kind === "image") {
      // pdf-arrange places images at their native size, rotated by /Rotate.
      expectedRotation = item.rotation;
      if (!(await pdf.drawsImage(j + 1))) {
        violations.push({ property: "page-identity", detail: `${at}: shows no image` });
      }
    } else {
      const src = sourcePages.get(`${item.sourceFileId}#${item.sourcePageIndex}`);
      // A source page pdfjs cannot load has nothing to compare against.
      if (!src) continue;
      expectedRotation = src.rotation + item.rotation;
      const sameBox =
        Math.abs(out.width - src.width) < 0.01 && Math.abs(out.height - src.height) < 0.01;
      if (!sameBox || (await pdf.text(j + 1)) !== src.text) {
        violations.push({
          property: "page-identity",
          detail: `${at}: is not ${item.sourceFileName} page ${item.sourcePageIndex + 1}`,
        });
      }
    }

    if (normalise(out.rotation) !== normalise(expectedRotation)) {
      violations.push({
        property: "page-rotation",
        detail: `${at}: expected ${normalise(expectedRotation)}°, got ${normalise(out.rotation)}°`,
      });
    }
  }
  return violations;
}

/**
 * The size bound: a file holds only pages of its sources, so it stays within
 * the sources it draws from, plus a margin for the rewritten structure.
 * Sections with PNG pages are left out: pdf-lib re-encodes PNG pixels, whose
 * size bears no fixed relation to the PNG file's.
 */
function sizeBound(sources: PdfArrangeSources, section: PageItem[]): number | null {
  let total = 0;
  for (const id of new Set(section.map((item) => item.sourceFileId))) {
    const bytes = sources.get(id);
    if (!bytes) return null;
    const isImage = section.some((item) => item.sourceFileId === id && item.kind === "image");
    if (isImage && isPng(bytes)) return null;
    total += bytes.byteLength;
  }
  return total + 4096 + total / 50;
}

/**
 * pdf-arrange output properties (spec #51), checked with pdfjs: pdf-lib
 * wrote the output, so this is a cross-engine check. ⚡ = also at `quick`.
 *
 * - ⚡ `file-count`: one output file per section
 * - ⚡ `pdf-opens`: each file opens in pdfjs without a password
 * - ⚡ `first-page-renders`: each file's page 1 renders. `quick` renders it
 *   in the first file and only loads it in the others: splitting every page
 *   would otherwise render the whole document, several times the cost of
 *   assembling it. `full` renders it in every file
 * - ⚡ `page-count`: each file has exactly its section's pages
 * - `page-rotation`: each page's rotation is its source page's own plus the
 *   requested turn (image pages: the requested turn)
 * - `page-identity`: page N of a file is the N-th page of its section, i.e.
 *   order and identity follow the arrangement. A pdf page matches its source
 *   page's box and text; an image page must show an image
 * - `size-bound`: each file ≤ the sources it draws from + a margin
 *
 * Defects the source already had are not the tool's doing: a first page that
 * does not render in its source either is not reported, and pages pdfjs
 * cannot load from their source are not compared.
 */
export const checkPdfArrange: OutputChecker<
  PdfArrangeSources,
  PdfArrangeRequest,
  Uint8Array[]
> = async (sources, { sections }, outputs, depth) => {
  const violations: Violation[] = [];
  if (outputs.length !== sections.length) {
    violations.push({
      property: "file-count",
      detail: `${sections.length} sections → ${outputs.length} files`,
    });
  }

  const sourcePages =
    depth === "full" ? await readSourcePages(sources, sections) : new Map();

  const files = Math.min(outputs.length, sections.length);
  for (let i = 0; i < files; i++) {
    const section = sections[i];
    const file = i + 1;
    const found = await inspectPdf(outputs[i], async (inspection): Promise<Violation[]> => {
      if (inspection.status === "password-required") {
        return [{ property: "pdf-opens", detail: `file ${file}: asks for a password` }];
      }
      if (inspection.status === "unopenable") {
        return [{ property: "pdf-opens", detail: `file ${file}: ${inspection.detail}` }];
      }
      const { pdf } = inspection;
      const vs: Violation[] = [];
      if (pdf.pageCount !== section.length) {
        vs.push({
          property: "page-count",
          detail: `file ${file}: ${section.length} pages kept → ${pdf.pageCount}`,
        });
      }
      const firstPageError =
        pdf.pageCount === 0
          ? "no pages"
          : i === 0 || depth === "full"
            ? await pdf.renderError(1)
            : await pdf.loadError(1);
      if (firstPageError !== null && !(await sourceFailsToo(sources, section[0]))) {
        vs.push({ property: "first-page-renders", detail: `file ${file}: ${firstPageError}` });
      }
      if (depth === "full") vs.push(...(await checkPages(pdf, section, file, sourcePages)));
      return vs;
    });
    violations.push(...found);

    if (depth === "full") {
      const bound = sizeBound(sources, section);
      if (bound !== null && outputs[i].byteLength > bound) {
        violations.push({
          property: "size-bound",
          detail: `file ${file}: ${outputs[i].byteLength} > ${Math.round(bound)} bytes`,
        });
      }
    }
  }

  return violations;
};
