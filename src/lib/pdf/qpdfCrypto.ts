// The wasm boundary for pdf-lock. Wraps @neslinesli93/qpdf-wasm to encrypt
// (lock) or decrypt (unlock) a PDF entirely in-browser. Each call:
//   1. spins up a FRESH qpdf instance (no caching — see qpdf.ts for why)
//   2. writes the input into the Emscripten MEMFS
//   3. runs the prebuilt argv (from qpdfArgs.ts)
//   4. reads the output, runs a pure output guard
//   5. ALWAYS unlinks both MEMFS files so the PDF bytes don't linger in the
//      wasm filesystem (the password strings themselves still live in JS state
//      and wasm linear memory until GC — this is a local-only, 0-server tool).
//
// Pure logic (argv build, output guards, naming, validation) lives in sibling
// modules and is unit-tested; this file is exercised via user-facing /qa.
import { withQpdf } from "./qpdf";
import {
  buildEncryptArgs,
  buildDecryptArgs,
  type LockPermissions,
  DEFAULT_INPUT_PATH,
  DEFAULT_OUTPUT_PATH,
} from "./qpdfArgs";
import { assertEncryptedPdf, assertDecryptedPdf } from "./qpdfOutputGuard";
import { classifyQpdfResult } from "./qpdfResultClass";
import { generateOwnerPassword } from "./ownerPassword";
import { WRONG_PASSWORD_PREFIX } from "../errors";

export interface EncryptPdfOptions {
  /** Raw PDF bytes (read once by the caller and shared across operations). */
  bytes: Uint8Array;
  userPassword: string;
  /** Owner password; when omitted, a random one is generated (see encryptPdf). */
  ownerPassword?: string;
  permissions: LockPermissions;
  onProgress?: (pct: number) => void;
}

export interface DecryptPdfOptions {
  /** Raw PDF bytes (read once by the caller and shared across operations). */
  bytes: Uint8Array;
  password: string;
  onProgress?: (pct: number) => void;
}

export interface QpdfCryptoResult {
  data: Uint8Array;
}

/**
 * Run an argv against a fresh qpdf instance with `input` pre-written to MEMFS.
 * Returns the exit code, captured stderr, and output bytes (or null). Always
 * unlinks both MEMFS paths in a finally block so nothing persists in RAM.
 */
async function runQpdf(
  input: Uint8Array,
  args: string[],
): Promise<{ exit: number; stderr: string; out: Uint8Array | null }> {
  // withQpdf installs the stderr capture BEFORE the module is created (required
  // by this build — see qpdf.ts) and runs everything below inside that window.
  const { result, stderr } = await withQpdf((qpdf) => {
    qpdf.FS.writeFile(DEFAULT_INPUT_PATH, input);
    let exit = 0;
    try {
      // Emscripten may throw an ExitStatus / number for non-zero exits.
      exit = qpdf.callMain(args);
    } catch (e) {
      exit = typeof e === "number" ? e : ((e as { status?: number })?.status ?? 1);
    }

    let out: Uint8Array | null = null;
    try {
      const view = qpdf.FS.readFile(DEFAULT_OUTPUT_PATH);
      // Copy off the MEMFS-backed view before unlink so it stays valid after.
      out = view ? new Uint8Array(view) : null;
    } catch {
      out = null;
    } finally {
      for (const p of [DEFAULT_INPUT_PATH, DEFAULT_OUTPUT_PATH]) {
        try {
          qpdf.FS.unlink(p);
        } catch {
          // already gone / never created — fine.
        }
      }
    }
    return { exit, out };
  });

  return { exit: result.exit, stderr, out: result.out };
}

/** Lock a PDF with AES-256, applying the permission toggles. */
export async function encryptPdf({
  bytes,
  userPassword,
  ownerPassword,
  permissions,
  onProgress,
}: EncryptPdfOptions): Promise<QpdfCryptoResult> {
  onProgress?.(10);
  const input = bytes;
  onProgress?.(30);

  const args = buildEncryptArgs({
    userPassword,
    // SECURITY: never default the owner password to the user password. If they
    // match, opening with the user's password authenticates as OWNER and the
    // viewer ignores the permission bits (print/copy stay allowed). Generate an
    // independent random owner password the user never sees so the only usable
    // password authenticates as USER and the restrictions are enforced.
    ownerPassword: ownerPassword?.length ? ownerPassword : generateOwnerPassword(),
    permissions,
  });

  const { exit, stderr, out } = await runQpdf(input, args);
  onProgress?.(80);

  // qpdf may return exit 3 (warnings) on a structurally-imperfect but valid
  // source while still producing a correct encrypted output, so classify on the
  // produced output rather than `exit === 0`. The output guard then proves the
  // bytes are a real encrypted PDF.
  const outcome = classifyQpdfResult(exit, stderr, !!out);
  if (outcome !== "ok" || !out) {
    throw new Error(`CORRUPT_OUTPUT: qpdf encrypt failed (exit ${exit}) ${stderr.trim()}`);
  }
  assertEncryptedPdf(out);
  onProgress?.(100);
  return { data: out };
}

/** Unlock a password-protected PDF. Wrong password → WRONG_PASSWORD sentinel. */
export async function decryptPdf({
  bytes,
  password,
  onProgress,
}: DecryptPdfOptions): Promise<QpdfCryptoResult> {
  onProgress?.(10);
  const input = bytes;
  onProgress?.(30);

  const args = buildDecryptArgs({ password });
  const { exit, stderr, out } = await runQpdf(input, args);
  onProgress?.(80);

  const outcome = classifyQpdfResult(exit, stderr, !!out);
  if (outcome === "wrong-password") {
    throw new Error(`${WRONG_PASSWORD_PREFIX}: ${stderr.trim()}`);
  }
  if (outcome !== "ok" || !out) {
    throw new Error(`CORRUPT_OUTPUT: qpdf decrypt failed (exit ${exit}) ${stderr.trim()}`);
  }
  assertDecryptedPdf(out);
  onProgress?.(100);
  return { data: out };
}
