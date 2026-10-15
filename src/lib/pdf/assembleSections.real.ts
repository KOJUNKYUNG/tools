// Real-file regression set entry for pdf-arrange (`pnpm test:real`).
import { inspectPdf } from "@/lib/output-check/pdfInspector";
import {
  realFileSuite,
  type RealFileRequest,
} from "@/lib/output-check/realFileSuite";
import { arrangePdf } from "./assembleSections";
import type { PageItem, Rotation } from "./pageItem";
import { checkPdfArrange, type PdfArrangeRequest } from "./pdfArrangeCheck";

// The suite hands over one file; "a" and "b" let it stand in for two uploads.
const sourcesOf = (input: Uint8Array) =>
  new Map([
    ["a", input],
    ["b", input],
  ]);

function page(sourceFileId: string, index: number, rotation: Rotation = 0): PageItem {
  return {
    id: `${sourceFileId}-${index}`,
    sourceFileId,
    sourceFileName: `${sourceFileId}.pdf`,
    kind: "pdf",
    sourcePageIndex: index,
    rotation,
    splitAfter: false,
    deleted: false,
  };
}

async function requests(input: Uint8Array): Promise<RealFileRequest<PdfArrangeRequest>[]> {
  // The editor skips files it cannot open (encrypted ones), as pdf-lib would
  // refuse them: such a fixture has nothing to arrange.
  const pageCount = await inspectPdf(input, async (i) =>
    i.status === "open" ? i.pdf.pageCount : 0,
  );
  if (pageCount === 0) return [];

  const all = (id: string) => Array.from({ length: pageCount }, (_, i) => page(id, i));
  const rotations: Rotation[] = [90, 180, 270];
  return [
    { label: "as uploaded (default)", request: { sections: [all("a")] } },
    { label: "merge two files", request: { sections: [[...all("a"), ...all("b")]] } },
    { label: "split every page", request: { sections: all("a").map((p) => [p]) } },
    {
      label: "reverse, rotate, delete every third",
      request: {
        sections: [
          all("a")
            .reverse()
            .filter((_, i) => i % 3 !== 2)
            .map((p, i) => ({ ...p, rotation: rotations[i % 3] })),
        ],
      },
    },
  ];
}

realFileSuite({
  tool: "pdf-arrange",
  extensions: [".pdf"],
  requests,
  run: (input, { sections }) => arrangePdf({ sections, sourceBytesById: sourcesOf(input) }),
  check: (input, request, output, depth) =>
    checkPdfArrange(sourcesOf(input), request, output, depth),
});
