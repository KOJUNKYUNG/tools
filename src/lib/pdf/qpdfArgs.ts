// Pure builders that translate user intent (passwords + permission toggles)
// into a qpdf CLI argv. Kept free of any wasm dependency so the full
// permission x password matrix is unit-testable without loading the 1.3MB
// engine. The wasm boundary (qpdfCrypto.ts) only runs the argv these produce.
//
// qpdf encryption argv shape (verified against the engine's own --help):
//
//   --encrypt <user-pw> <owner-pw> <keylen> [restriction flags] -- <in> <out>
//
// Notes learned from smoke-testing @neslinesli93/qpdf-wasm@0.3.0:
//   - The input path must appear ONCE, after the `--` separator. Passing it
//     before `--encrypt` too triggers "unknown argument <out>".
//   - `--accessibility=n` is IGNORED for modern (256-bit) encryption and the
//     engine prints a warning, so we never emit it.

export const DEFAULT_INPUT_PATH = "/input.pdf";
export const DEFAULT_OUTPUT_PATH = "/output.pdf";

/** AES-256. We hard-pin the strongest option; the UI hides the choice. */
const KEY_LENGTH = "256";

export interface LockPermissions {
  /** Allow printing. Off → `--print=none`; on → `--print=full`. */
  allowPrint: boolean;
  /** Allow text/graphics copy + extraction. Off → `--extract=n`; on → `=y`. */
  allowCopy: boolean;
}

export interface BuildEncryptArgsInput {
  userPassword: string;
  ownerPassword: string;
  permissions: LockPermissions;
  inputPath?: string;
  outputPath?: string;
}

export function buildEncryptArgs({
  userPassword,
  ownerPassword,
  permissions,
  inputPath = DEFAULT_INPUT_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
}: BuildEncryptArgsInput): string[] {
  return [
    "--encrypt",
    userPassword,
    ownerPassword,
    KEY_LENGTH,
    `--print=${permissions.allowPrint ? "full" : "none"}`,
    `--extract=${permissions.allowCopy ? "y" : "n"}`,
    // Editing-class permissions stay locked regardless of the two toggles we
    // expose; non-experts only reason about print + copy.
    "--modify=none",
    "--",
    inputPath,
    outputPath,
  ];
}

export interface BuildDecryptArgsInput {
  password: string;
  inputPath?: string;
  outputPath?: string;
}

export function buildDecryptArgs({
  password,
  inputPath = DEFAULT_INPUT_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
}: BuildDecryptArgsInput): string[] {
  return [
    `--password=${password}`,
    "--decrypt",
    "--",
    inputPath,
    outputPath,
  ];
}
