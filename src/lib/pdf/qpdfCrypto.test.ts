import { PDFDocument } from "pdf-lib";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CORRUPT_OUTPUT_PREFIX, WRONG_PASSWORD_PREFIX } from "@/lib/errors";
import * as check from "./pdfLockCheck";
import { decryptPdf, encryptPdf } from "./qpdfCrypto";
import { initQpdfForNode } from "./qpdfNode";

// The real checker by default; some tests make it report damage.
vi.mock("./pdfLockCheck", async (importOriginal) => {
  const real = await importOriginal<typeof check>();
  return { ...real, checkPdfLock: vi.fn(real.checkPdfLock) };
});
const { checkPdfLock } = await vi.importActual<typeof check>("./pdfLockCheck");
const mockedCheck = vi.mocked(check.checkPdfLock);

beforeAll(initQpdfForNode);
afterEach(() => mockedCheck.mockReset().mockImplementation(checkPdfLock));

async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  return doc.save();
}

const permissions = { allowPrint: true, allowCopy: false };
const damaged = [{ property: "locked", detail: "test" }];

describe("encryptPdf", () => {
  it("returns a locked file that passes the full check", async () => {
    const bytes = await pdfOf(3);
    const { data } = await encryptPdf({ bytes, userPassword: "secret", permissions });
    const request = { mode: "lock" as const, userPassword: "secret", permissions };
    expect(await checkPdfLock(bytes, request, data, "full")).toEqual([]);
  });

  it("takes passwords that start with a dash as passwords, not options", async () => {
    // The generated owner password draws from an alphabet that includes "-".
    const bytes = await pdfOf(1);
    const { data } = await encryptPdf({
      bytes,
      userPassword: "-secret",
      ownerPassword: "-owner",
      permissions,
    });
    expect(await decryptPdf({ bytes: data, password: "-secret" })).toBeTruthy();
  });

  it("blocks an output the check rejects", async () => {
    mockedCheck.mockResolvedValue(damaged);
    await expect(
      encryptPdf({ bytes: await pdfOf(1), userPassword: "secret", permissions }),
    ).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });
});

describe("decryptPdf", () => {
  it("returns an unlocked file that passes the full check", async () => {
    const plain = await pdfOf(3);
    const { data: bytes } = await encryptPdf({ bytes: plain, userPassword: "secret", permissions });
    const { data } = await decryptPdf({ bytes, password: "secret" });
    expect(await checkPdfLock(bytes, { mode: "unlock", password: "secret" }, data, "full")).toEqual(
      [],
    );
  });

  it("reports a wrong password, not a damaged file", async () => {
    const { data: bytes } = await encryptPdf({
      bytes: await pdfOf(1),
      userPassword: "secret",
      permissions,
    });
    await expect(decryptPdf({ bytes, password: "nope" })).rejects.toThrow(WRONG_PASSWORD_PREFIX);
  });

  it("blocks an output the check rejects", async () => {
    const { data: bytes } = await encryptPdf({
      bytes: await pdfOf(1),
      userPassword: "secret",
      permissions,
    });
    mockedCheck.mockResolvedValue(damaged);
    await expect(decryptPdf({ bytes, password: "secret" })).rejects.toThrow(CORRUPT_OUTPUT_PREFIX);
  });
});
