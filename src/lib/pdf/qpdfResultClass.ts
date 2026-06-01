// Pure classification of a qpdf run's outcome. Separated so the exit-code
// semantics are unit-tested without the wasm engine.
//
// qpdf exit codes (from the qpdf manual):
//   0 = success, no warnings
//   2 = errors were found (operation failed)
//   3 = warnings were found, but the operation SUCCEEDED
//
// So exit code alone cannot decide success: exit 3 is a success with a usable
// output (e.g. a structurally-imperfect source PDF that qpdf repaired while
// encrypting). We decide on: wrong-password (from stderr) > has-output > failed.

export type QpdfOutcome = "ok" | "wrong-password" | "failed";

function isWrongPassword(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return s.includes("invalid password") || s.includes("incorrect password");
}

export function classifyQpdfResult(
  exit: number,
  stderr: string,
  hasOutput: boolean,
): QpdfOutcome {
  // A wrong unlock password is a normal user mistake — detect it first, from
  // stderr, independent of the exit code or whether a partial file exists.
  if (isWrongPassword(stderr)) return "wrong-password";
  // Otherwise success requires BOTH a produced output AND a success exit code.
  // qpdf only returns 0 (clean) or 3 (warnings, succeeded) on success; any
  // other code (2 = error, or an Emscripten abort surfaced as 1) means the
  // output — if any — may be truncated/garbage, so treat it as failed.
  if (hasOutput && (exit === 0 || exit === 3)) return "ok";
  return "failed";
}
