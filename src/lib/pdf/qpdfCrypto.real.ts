// Real-file regression set entry for pdf-lock (`pnpm test:real`).
import { beforeAll } from "vitest";
import { inspectPdf, pdfPageCount } from "@/lib/output-check/pdfInspector";
import { realFileSuite, type RealFileRequest } from "@/lib/output-check/realFileSuite";
import { checkPdfLock, type PdfLockRequest, type PdfUnlockRequest } from "./pdfLockCheck";
import { decryptPdf, encryptPdf } from "./qpdfCrypto";
import { initQpdfForNode } from "./qpdfNode";

beforeAll(initQpdfForNode);

type Request = PdfLockRequest | PdfUnlockRequest;

/**
 * The password tried on encrypted fixtures. One that does not open with it is
 * skipped, so a fixture locked with another password needs no bookkeeping.
 */
const FIXTURE_PASSWORD = "1234";

async function requests(input: Uint8Array): Promise<RealFileRequest<Request>[]> {
  // The tool offers unlock for an encrypted file and lock for a plain one.
  const encrypted = await inspectPdf(input, async (i) =>
    i.status === "open" ? i.pdf.encrypted() : i.status === "password-required",
  );
  if (encrypted) {
    const opens = (await pdfPageCount(input, FIXTURE_PASSWORD)) !== null;
    return opens
      ? [{ label: "unlock", request: { mode: "unlock", password: FIXTURE_PASSWORD } }]
      : [];
  }
  const lock = (allowPrint: boolean, allowCopy: boolean): PdfLockRequest => ({
    mode: "lock",
    userPassword: "real-file-test",
    permissions: { allowPrint, allowCopy },
  });
  return [
    { label: "lock, print and copy off (default)", request: lock(false, false) },
    { label: "lock, print and copy on", request: lock(true, true) },
  ];
}

realFileSuite<Request, Uint8Array>({
  tool: "pdf-lock",
  extensions: [".pdf"],
  requests,
  run: async (bytes, request) =>
    (request.mode === "lock"
      ? await encryptPdf({ bytes, ...request })
      : await decryptPdf({ bytes, password: request.password })
    ).data,
  check: checkPdfLock,
});
