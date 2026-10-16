import type { OutputChecker, Violation } from "@/lib/output-check/core";
import {
  inspectPdf,
  pdfPageCount,
  type PdfInspection,
  type PdfPermissions,
} from "@/lib/output-check/pdfInspector";
import type { LockPermissions } from "./qpdfArgs";

export interface PdfLockRequest {
  mode: "lock";
  userPassword: string;
  permissions: LockPermissions;
}
export interface PdfUnlockRequest {
  mode: "unlock";
  password: string;
}

/**
 * The size bound: qpdf rewrites the file's structure and AES adds a few
 * bytes per stream and string, so either way the output stays near the input.
 */
const sizeBound = (input: Uint8Array) => input.byteLength * 1.1 + 16_384;

const PERMISSION_KEYS = ["print", "copy", "modify"] as const;

/** What a viewer may do with a locked file: print and copy as asked, never edit. */
function permissionMismatch(
  requested: LockPermissions,
  actual: PdfPermissions | null,
): string | null {
  // No restrictions at all reads as everything allowed.
  const got = actual ?? { print: true, copy: true, modify: true };
  const want = { print: requested.allowPrint, copy: requested.allowCopy, modify: false };
  const wrong = PERMISSION_KEYS.filter((key) => got[key] !== want[key]);
  return wrong.length === 0
    ? null
    : wrong.map((key) => `${key} ${want[key] ? "denied" : "allowed"}`).join(", ");
}

/**
 * The output did not open (`notOpenDetail` says why it asked for a password).
 * Not the tool's doing when the input does not open either (`pages` null).
 */
function notOpened(
  inspection: Exclude<PdfInspection, { status: "open" }>,
  pages: number | null,
  notOpenDetail: string,
): Violation[] {
  if (pages === null) return [];
  const detail = inspection.status === "unopenable" ? inspection.detail : notOpenDetail;
  return [{ property: "pdf-opens", detail }];
}

function pageCountViolations(pages: number | null, actual: number): Violation[] {
  return pages !== null && actual !== pages
    ? [{ property: "page-count", detail: `${pages} pages → ${actual}` }]
    : [];
}

async function lockViolations(
  input: Uint8Array,
  { userPassword, permissions }: PdfLockRequest,
  output: Uint8Array,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const pages = await pdfPageCount(input);
  if (await inspectPdf(output, async (i) => i.status === "open")) {
    violations.push({ property: "locked", detail: "opens without a password" });
  }
  const opened = await inspectPdf(
    output,
    async (inspection): Promise<Violation[]> => {
      if (inspection.status !== "open") {
        return notOpened(inspection, pages, "the given password does not open it");
      }
      const { pdf } = inspection;
      const vs = pageCountViolations(pages, pdf.pageCount);
      const mismatch = permissionMismatch(permissions, await pdf.permissions());
      if (mismatch !== null) vs.push({ property: "permissions", detail: mismatch });
      return vs;
    },
    { password: userPassword },
  );
  return [...violations, ...opened];
}

async function unlockViolations(
  input: Uint8Array,
  { password }: PdfUnlockRequest,
  output: Uint8Array,
): Promise<Violation[]> {
  const pages = await pdfPageCount(input, password);
  return inspectPdf(output, async (inspection) =>
    inspection.status === "open"
      ? pageCountViolations(pages, inspection.pdf.pageCount)
      : notOpened(inspection, pages, "still asks for a password"),
  );
}

/**
 * pdf-lock output properties (spec #51, confirmed in #60). qpdf wrote the
 * output; pdfjs reads it, so every check is cross-engine. ⚡ = also at `quick`.
 *
 * Lock:
 * - ⚡ `locked`: the output does not open without a password
 * - ⚡ `pdf-opens`: the output opens with the user's password
 * - ⚡ `page-count`: it has the input's page count
 * - ⚡ `permissions`: print and copy are as requested, editing is denied
 *
 * Unlock:
 * - ⚡ `pdf-opens`: the output opens without a password, i.e. it is no longer
 *   locked
 * - ⚡ `page-count`: it has the input's page count (the input opened with the
 *   given password)
 *
 * Both: `size-bound`, the output stays near the input's size.
 *
 * An input pdfjs cannot open is not the tool's doing: then neither the
 * output's opening nor its page count is judged.
 */
export const checkPdfLock: OutputChecker<
  Uint8Array,
  PdfLockRequest | PdfUnlockRequest,
  Uint8Array
> = async (input, request, output, depth) => {
  const violations: Violation[] = [];
  if (depth === "full" && output.byteLength > sizeBound(input)) {
    violations.push({
      property: "size-bound",
      detail: `${input.byteLength} → ${output.byteLength} bytes`,
    });
  }
  violations.push(
    ...(request.mode === "lock"
      ? await lockViolations(input, request, output)
      : await unlockViolations(input, request, output)),
  );
  return violations;
};
