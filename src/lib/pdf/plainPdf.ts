// Rewrites a PDF with qpdf into the plainest structure: one cross-reference
// table, no object streams, every object at generation 0. The content does not
// change, and the streams are copied as they are.
//
// justpdf 0.1.3 silently drops the objects of two legal structures, which leaves
// a file that opens with its form fields or tags gone:
// - hybrid-reference files (/XRefStm, as Word writes them): it never reads the
//   stream, so it loses the objects hidden there. Upstream #53, open
// - objects at a generation other than 0: it writes them at 0 and leaves the
//   references at their generation, which read as null. Fixed upstream after
//   0.1.3, not released
// Neither exists in a plain file.
//
// qpdf reads a hybrid file's hidden objects when /XRefStm sits in a newer section
// than the table marking them free, as in Word's files. With both in one section
// it reads them as free, and the references to them go too, so the check cannot
// see it: the spec's own layout, not seen in a real file yet.
//
// Only a recovery, not the first pass: qpdf fails on a few files justpdf reads
// (annotation-polyline-polygon.pdf in pdf.js's samples), and it costs a second
// wasm start.

import { runQpdf } from "./qpdf";
import { DEFAULT_INPUT_PATH, DEFAULT_OUTPUT_PATH } from "./qpdfArgs";
import { classifyQpdfResult } from "./qpdfResultClass";

export async function toPlainPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const { exit, stderr, out } = await runQpdf(bytes, [
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_PATH,
    "--object-streams=disable",
    "--stream-data=preserve",
  ]);
  if (out === null || classifyQpdfResult(exit, stderr, true) !== "ok") {
    throw new Error(`qpdf could not rewrite the file (exit ${exit})`);
  }
  return out;
}
