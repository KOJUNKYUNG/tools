import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Violation } from "@/lib/output-check/core";
import { withQpdf } from "./qpdf";
import { buildDecryptArgs, buildEncryptArgs, type LockPermissions } from "./qpdfArgs";
import { initQpdfForNode } from "./qpdfNode";
import {
  checkPdfLock,
  hasEncryptKey,
  type PdfLockRequest,
  type PdfUnlockRequest,
} from "./pdfLockCheck";

beforeAll(initQpdfForNode);

async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    doc.addPage([200, 300]).drawText(`page ${i + 1}`, { x: 10, y: 10, font });
  }
  return doc.save();
}

/** Run qpdf directly, bypassing the engine entry and its own output check. */
async function qpdf(input: Uint8Array, args: string[]): Promise<Uint8Array> {
  const { result } = await withQpdf((q) => {
    q.FS.writeFile("/input.pdf", input);
    q.callMain(args);
    return new Uint8Array(q.FS.readFile("/output.pdf"));
  });
  return result;
}

const restricted: LockPermissions = { allowPrint: false, allowCopy: false };

const lock = (input: Uint8Array, userPassword: string, permissions = restricted) =>
  qpdf(input, buildEncryptArgs({ userPassword, ownerPassword: "owner-secret", permissions }));

const unlock = (input: Uint8Array, password: string) =>
  qpdf(input, buildDecryptArgs({ password }));

const lockRequest = (permissions = restricted): PdfLockRequest => ({
  mode: "lock",
  userPassword: "secret",
  permissions,
});
const unlockRequest: PdfUnlockRequest = { mode: "unlock", password: "secret" };

const props = (vs: Violation[]) => vs.map((v) => v.property);

describe("checkPdfLock: lock", () => {
  it("passes a locked file that opens with the password and keeps every page", async () => {
    const input = await pdfOf(3);
    for (const permissions of [
      restricted,
      { allowPrint: true, allowCopy: false },
      { allowPrint: true, allowCopy: true },
    ]) {
      const output = await lock(input, "secret", permissions);
      expect(await checkPdfLock(input, lockRequest(permissions), output, "full")).toEqual([]);
    }
  });

  it("flags an output that opens without a password", async () => {
    const input = await pdfOf(3);
    expect(props(await checkPdfLock(input, lockRequest(), input, "quick"))).toContain("locked");
  });

  it("flags an output the given password does not open", async () => {
    const input = await pdfOf(3);
    const output = await lock(input, "other");
    expect(props(await checkPdfLock(input, lockRequest(), output, "quick"))).toEqual(["pdf-opens"]);
  });

  it("flags a lost page", async () => {
    const output = await lock(await pdfOf(2), "secret");
    expect(props(await checkPdfLock(await pdfOf(3), lockRequest(), output, "quick"))).toEqual([
      "page-count",
    ]);
  });

  it("flags permissions other than the requested ones", async () => {
    const input = await pdfOf(1);
    const output = await lock(input, "secret", { allowPrint: true, allowCopy: false });
    const violations = await checkPdfLock(input, lockRequest(), output, "quick");
    expect(props(violations)).toEqual(["permissions"]);
    expect(violations[0].detail).toContain("print");
  });

  it("flags editing left allowed", async () => {
    const input = await pdfOf(1);
    // The tool's own argv minus `--modify=none`.
    const args = buildEncryptArgs({
      userPassword: "secret",
      ownerPassword: "owner-secret",
      permissions: restricted,
    }).filter((arg) => arg !== "--modify=none");
    const output = await qpdf(input, args);
    expect(props(await checkPdfLock(input, lockRequest(), output, "quick"))).toEqual([
      "permissions",
    ]);
  });

  it("flags unopenable bytes", async () => {
    const input = await pdfOf(2);
    const output = (await lock(input, "secret")).slice(0, 400);
    expect(props(await checkPdfLock(input, lockRequest(), output, "quick"))).toEqual(["pdf-opens"]);
  });

  it("does not blame the tool for an input pdfjs cannot open", async () => {
    const input = new TextEncoder().encode("%PDF-1.7\nnot really a pdf");
    expect(await checkPdfLock(input, lockRequest(), input.slice(0, 10), "full")).toEqual([]);
  });
});

describe("checkPdfLock: unlock", () => {
  it("passes an unlocked file that opens without a password and keeps every page", async () => {
    const input = await lock(await pdfOf(3), "secret");
    const output = await unlock(input, "secret");
    expect(await checkPdfLock(input, unlockRequest, output, "full")).toEqual([]);
  });

  it("flags an output that still asks for a password", async () => {
    const input = await lock(await pdfOf(3), "secret");
    const violations = await checkPdfLock(input, unlockRequest, input, "quick");
    expect(props(violations)).toEqual(["pdf-opens"]);
    expect(violations[0].detail).toContain("password");
  });

  it("flags a lost page", async () => {
    const input = await lock(await pdfOf(3), "secret");
    expect(props(await checkPdfLock(input, unlockRequest, await pdfOf(2), "quick"))).toEqual([
      "page-count",
    ]);
  });

  it("flags unopenable bytes", async () => {
    const input = await lock(await pdfOf(3), "secret");
    const output = (await unlock(input, "secret")).slice(0, 400);
    expect(props(await checkPdfLock(input, unlockRequest, output, "quick"))).toEqual(["pdf-opens"]);
  });
});

describe("checkPdfLock: size", () => {
  it("flags an output far larger than the input, at full depth only", async () => {
    const input = await pdfOf(1);
    const doc = await PDFDocument.load(input);
    await doc.attach(randomBytes(200_000), "pad.bin");
    const output = await lock(await doc.save(), "secret");
    expect(await checkPdfLock(input, lockRequest(), output, "quick")).toEqual([]);
    expect(props(await checkPdfLock(input, lockRequest(), output, "full"))).toEqual(["size-bound"]);
  });
});

describe("hasEncryptKey", () => {
  it("finds the key in a locked file and not in a plain one", async () => {
    const plain = await pdfOf(2);
    expect(hasEncryptKey(plain)).toBe(false);
    expect(hasEncryptKey(await lock(plain, "secret"))).toBe(true);
  });
});
