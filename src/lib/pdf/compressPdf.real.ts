// Real-file regression set entry for pdf-compress (`pnpm test:real`).
import { beforeAll } from "vitest";
import { inspectPdf } from "@/lib/output-check/pdfInspector";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import { SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { compressPdfFromBytes, type CompressPdfResult } from "./compressPdf";
import { initJustpdfForNode } from "./justpdfNode";
import { checkPdfCompress, type PdfCompressRequest } from "./pdfCompressCheck";

beforeAll(initJustpdfForNode);

async function requests(input: Uint8Array): Promise<RealFileRequest<PdfCompressRequest>[]> {
  // The tool refuses encrypted PDFs before compressing: nothing to run.
  const encrypted = await inspectPdf(input, async (i) =>
    i.status === "open" ? i.pdf.encrypted() : true,
  );
  if (encrypted) return [];
  return [
    { label: "medium (default)", request: { preset: "medium" } },
    { label: "light", request: { preset: "low" } },
    { label: "heavy", request: { preset: "high" } },
  ];
}

realFileSuite<PdfCompressRequest, CompressPdfResult>({
  tool: "pdf-compress",
  extensions: [".pdf"],
  requests,
  run: (bytes, { preset }) => compressPdfFromBytes({ bytes, preset }),
  check: async (input, request, result, depth) => {
    if (result.kind === "compressed") {
      return checkPdfCompress(input, request, result.data, depth);
    }
    // Nothing is offered, so the only claim to hold is that it did not shrink.
    return result.compressedSize >= result.originalSize
      ? []
      : [{ property: SIZE_BOUND, detail: "reported not-smaller, yet smaller" }];
  },
});
