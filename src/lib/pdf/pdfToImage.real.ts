// Real-file regression for pdf-to-image's choice of intent (`pnpm test:real`).
// Not a `realFileSuite`: the engine draws on a browser canvas, which Node cannot
// do, so this checks what the choice rests on: for every page `pageIntent` sends
// to print, pdf.js builds the same drawing as for display. `pnpm
// check:leaving-screen --tool=pdf-to-image` runs the engine itself, in real Chrome.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPdf } from "@/lib/output-check/pdfInspector";
import { nodePdfjsAdapter } from "@/lib/output-check/pdfjsNode";
import { findRealFixtures, realFixtureDir } from "@/lib/output-check/realFixtures";
import { pageIntent, type PageIntent } from "./pdfToImageIntent";

async function openDoc(input: Uint8Array) {
  const { lib, docParams } = await nodePdfjsAdapter.load();
  const doc = await lib.getDocument({
    ...docParams,
    data: input.slice(),
    verbosity: lib.VerbosityLevel.ERRORS,
  }).promise;
  return { lib, doc };
}

/**
 * A drawing's fingerprint. pdf.js names the objects it hands out by document
 * and by the order parallel annotations happened to reach them (`g_d3_f2`,
 * `img_p7_1`), which differs between two lists of one intent too, so each name
 * reads as its order of first use.
 */
function fingerprint(ops: unknown[]): string {
  const names = new Map<string, string>();
  const json = JSON.stringify(ops, (_key, value: unknown) => {
    if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    if (typeof value !== "string" || !/^(g_d\d+_|img_p\d+_)/.test(value)) return value;
    if (!names.has(value)) names.set(value, `object ${names.size}`);
    return names.get(value);
  });
  return createHash("sha256").update(json).digest("hex");
}

/**
 * Every page's drawing. The own canvas that display reserves for an annotation
 * follows the intent and means nothing to a render with no annotation canvases,
 * as the engine's is: its argument is dropped, and so is an annotation it left
 * empty (a push button with no appearance), of which print builds nothing.
 */
async function drawings(input: Uint8Array, intent: PageIntent): Promise<string[]> {
  const { lib, doc } = await openDoc(input);
  try {
    const { beginAnnotation, endAnnotation } = lib.OPS;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { fnArray, argsArray } = await page.getOperatorList({ intent });
      const ops = fnArray.flatMap((fn, i) => {
        if (fn === beginAnnotation && fnArray[i + 1] === endAnnotation) return [];
        if (fn === endAnnotation && fnArray[i - 1] === beginAnnotation) return [];
        return [[fn, fn === beginAnnotation ? argsArray[i].slice(0, 4) : argsArray[i]]];
      });
      pages.push(fingerprint(ops));
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

/** The pages sent to print, 1-based, whose drawing is not the display one. */
async function printPagesDrawnDifferently(input: Uint8Array): Promise<number[]> {
  const { doc } = await openDoc(input);
  const intents: PageIntent[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) intents.push(await pageIntent(doc, await doc.getPage(n)));
  } finally {
    await doc.destroy();
  }
  const display = await drawings(input, "display");
  const print = await drawings(input, "print");
  return intents.flatMap((intent, i) => (intent === "print" && print[i] !== display[i] ? [i + 1] : []));
}

describe("pdf-to-image: pages sent to print", () => {
  const dir = realFixtureDir();
  for (const file of findRealFixtures(dir, [".pdf"])) {
    it(`draw as on display: ${path.relative(dir, file)}`, async () => {
      const input = new Uint8Array(readFileSync(file));
      // The tool cannot open an encrypted PDF: nothing to run.
      const readable = await inspectPdf(input, async (i) => i.status === "open" && !(await i.pdf.encrypted()));
      if (readable) expect(await printPagesDrawnDifferently(input)).toEqual([]);
    });
  }
});
