import { PDFDocument } from "pdf-lib";

/**
 * True if `err` is pdf-lib signalling that the document is encrypted. pdf-lib
 * throws an `EncryptedPDFError` from `PDFDocument.load` when a document has an
 * /Encrypt dictionary and `ignoreEncryption` is not set. We match on both the
 * error name and the message text for resilience across pdf-lib versions.
 */
export function isEncryptionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "EncryptedPDFError") return true;
  return /encrypted/i.test(err.message);
}

/**
 * Detect whether a PDF is password/permission protected by attempting a plain
 * pdf-lib load: encrypted documents throw, plain documents load. Returns true
 * if encrypted, false if it loads cleanly. On any non-encryption parse error
 * we return false (treat as "not detectably encrypted") so a slightly-malformed
 * but openable PDF still flows through the normal lock path.
 */
export async function isPdfEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes);
    return false;
  } catch (err) {
    return isEncryptionError(err);
  }
}
