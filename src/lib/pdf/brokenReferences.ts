// Finds references that point at no object, for the compressed output check.
//
// A compressor that cannot read an object can drop it and keep the references
// to it: viewers read those as null, so the file still opens and page 1 still
// renders while form fields, embedded fonts and bookmarks are gone. justpdf does
// this to three legal structures (see plainPdf.ts).
//
// pdf-lib reads the file, not justpdf: an engine tends to accept its own
// mistakes. It reads each object where the file defines it, so it finds every
// object in an object stream, hybrid-reference files' hidden ones included. It
// ignores the cross-reference table, so an object the input freed still counts
// as defined: a live reference to one reads as lost. That costs a recovery, not
// a block, since the recovered file no longer has the reference.

import type { PDFDocument, PDFObject, PDFRef } from "pdf-lib";
import { LOAD_WITH_RARE_YIELDS } from "./pdfLibYields";

/** The file's objects, in pdf-lib's reading. */
function openForReferences(pdfLib: typeof import("pdf-lib"), bytes: Uint8Array): Promise<PDFDocument> {
  return pdfLib.PDFDocument.load(bytes, {
    ...LOAD_WITH_RARE_YIELDS,
    ignoreEncryption: true,
    updateMetadata: false,
  });
}

/**
 * The references reachable from the trailer that point at no object, as
 * `12 0 R` strings. Objects nothing reaches do not count: no viewer reads them.
 */
function brokenReferences(pdfLib: typeof import("pdf-lib"), doc: PDFDocument): Set<string> {
  const { PDFArray, PDFDict, PDFRef: Ref, PDFStream } = pdfLib;
  const { context } = doc;
  const broken = new Set<string>();
  const seen = new Set<PDFRef>();
  const { Root, Info } = context.trailerInfo;
  const stack: (PDFObject | undefined)[] = [Root, Info];

  while (stack.length > 0) {
    const object = stack.pop();
    if (object instanceof Ref) {
      if (seen.has(object)) continue;
      seen.add(object);
      const target = context.lookup(object);
      if (target === undefined) broken.add(object.toString());
      else stack.push(target);
    } else if (object instanceof PDFStream) {
      stack.push(object.dict);
    } else if (object instanceof PDFDict) {
      for (const [, value] of object.entries()) stack.push(value);
    } else if (object instanceof PDFArray) {
      stack.push(...object.asArray());
    }
  }
  return broken;
}

/**
 * The output's broken references that the input does not also have, since a
 * defect the input already had is not the tool's doing. The input is only read
 * when the output has some. Compares by object number: justpdf keeps them, so
 * `input` is the file justpdf read.
 *
 * Throws when pdf-lib cannot read a file. That proves nothing about the file:
 * pdfjs decides whether a file opens.
 */
export async function lostReferences(input: Uint8Array, output: Uint8Array): Promise<string[]> {
  const pdfLib = await import("pdf-lib");
  const broken = brokenReferences(pdfLib, await openForReferences(pdfLib, output));
  if (broken.size === 0) return [];
  const inherited = brokenReferences(pdfLib, await openForReferences(pdfLib, input));
  return [...broken].filter((ref) => !inherited.has(ref));
}
