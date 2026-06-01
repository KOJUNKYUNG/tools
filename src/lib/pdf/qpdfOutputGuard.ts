// Pure output guards for qpdf encrypt/decrypt results. Separated from the wasm
// runner (qpdfCrypto.ts) so the header / %PDF / /Encrypt checks are unit-
// testable without loading the engine. Reuses the CORRUPT_OUTPUT sentinel so
// the React error mapper swaps in the same localized "file is unusable" toast.
import { CORRUPT_OUTPUT_MARKER } from "./compressPdfIntegrity";

function hasPdfHeader(data: Uint8Array): boolean {
  return (
    data.length > 4 &&
    data[0] === 0x25 /* % */ &&
    data[1] === 0x50 /* P */ &&
    data[2] === 0x44 /* D */ &&
    data[3] === 0x46 /* F */
  );
}

/** Case-sensitive byte-substring search (PDF keywords are ASCII). */
function includesAscii(data: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  if (n.length === 0 || data.length < n.length) return false;
  outer: for (let i = 0; i <= data.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) {
      if (data[i + j] !== n[j]) continue outer;
    }
    return true;
  }
  return false;
}

function assertWellFormed(data: Uint8Array): void {
  if (data.length <= 4) {
    throw new Error(`${CORRUPT_OUTPUT_MARKER}: empty output (${data.length} bytes)`);
  }
  if (!hasPdfHeader(data)) {
    throw new Error(`${CORRUPT_OUTPUT_MARKER}: missing %PDF header`);
  }
}

/**
 * Verify the encrypt output is a real, encrypted PDF: well-formed header AND an
 * `/Encrypt` dictionary present. The latter guards against the engine silently
 * producing a plain (un-encrypted) copy — a security-critical no-op.
 */
export function assertEncryptedPdf(data: Uint8Array): void {
  assertWellFormed(data);
  if (!includesAscii(data, "/Encrypt")) {
    throw new Error(`${CORRUPT_OUTPUT_MARKER}: output is not encrypted (no /Encrypt)`);
  }
}

/**
 * Verify the decrypt output is a well-formed PDF. We do NOT assert the absence
 * of `/Encrypt`: qpdf's `--decrypt` removes the encryption but the literal
 * string may still appear in unrelated content, so header + non-empty is the
 * reliable signal. Wrong-password failures are caught earlier via exit code.
 */
export function assertDecryptedPdf(data: Uint8Array): void {
  assertWellFormed(data);
}
