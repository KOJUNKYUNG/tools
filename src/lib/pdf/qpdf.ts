// Single source of @neslinesli93/qpdf-wasm configuration. The wasm binary is
// self-hosted from public/qpdf/ (copied by scripts/copy-qpdf.mjs on postinstall)
// instead of fetched from a CDN at runtime — keeps the app fully self-contained
// and 0-server (ADR-0001).
//
// Unlike pdfjs (which caches one module instance), we intentionally create a
// FRESH qpdf instance per call and never cache it. Reason: qpdf processes
// password-protected PDFs through an Emscripten in-memory filesystem (MEMFS).
// A cached instance would retain the previous file's bytes and password in RAM,
// risking state bleed between operations. A throwaway instance guarantees zero
// bleed; the ~hundreds-of-ms re-init is hidden behind ProcessingStatus.

/** Self-hosted qpdf wasm URL (same-origin, served from public/qpdf/). */
export const QPDF_WASM_URL = "/qpdf/qpdf.wasm";

/**
 * Minimal shape of the Emscripten MEMFS we use. The bundled qpdf.d.ts omits
 * `writeFile` and `unlink` (both exist at runtime — verified against
 * dist/qpdf.js `Object.assign(G, { ...writeFile, readFile, unlink })`), so we
 * declare the surface we rely on here.
 */
export interface QpdfFS {
  writeFile: (path: string, data: Uint8Array) => void;
  readFile: (path: string) => Uint8Array;
  unlink: (path: string) => void;
  mkdir: (path: string) => void;
}

export interface QpdfInstance {
  /** Runs the qpdf CLI with the given argv. Returns the process exit code. */
  callMain: (args: string[]) => number;
  FS: QpdfFS;
}

interface CreateModuleOptions {
  locateFile: (path: string) => string;
  noInitialRun?: boolean;
}

type CreateModule = (opts: CreateModuleOptions) => Promise<QpdfInstance>;

/**
 * Create a fresh qpdf instance AND run `use(instance)` against it, capturing
 * everything qpdf writes to stderr.
 *
 * Why the unusual shape: this wasm build's Emscripten glue binds stderr to
 * `r = console.error.bind(console)` at MODULE-INIT time and ignores any
 * `printErr` override (verified against dist/qpdf.js). The bind snapshots
 * whatever `console.error` is at `createModule()` time, so to intercept stderr
 * we must patch `console.error` BEFORE instantiation and keep it patched for
 * the whole `use` call. This helper owns that window and restores the original
 * in a finally block, so a throw inside `use` can never leak the patch.
 *
 * A fresh instance per call is intentional (no caching): qpdf handles
 * password-protected bytes through an in-memory FS, and a reused instance could
 * bleed a previous file/password across operations.
 */
// Serializes all withQpdf calls. The stderr capture patches the GLOBAL
// console.error and holds it across two awaits (import + createModule). Two
// overlapping calls would corrupt the save/restore (each captures the other's
// patched console.error as its "original"), leaking a dead patch app-wide and
// bleeding one operation's stderr into another's. A single tool with a gated
// button is serial in practice, but a double-click race or React Strict-Mode
// double-invoke could still interleave, so we enforce serialization here.
let qpdfChain: Promise<unknown> = Promise.resolve();

async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = qpdfChain.then(fn);
  // Keep the chain alive regardless of this run's outcome.
  qpdfChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function withQpdf<T>(
  runWith: (qpdf: QpdfInstance) => T,
): Promise<{ result: T; stderr: string }> {
  return runExclusive(async () => {
    const originalError = console.error;
    let stderr = "";
    const patched = (...args: unknown[]) => {
      stderr += args.map((a) => String(a)).join(" ") + "\n";
    };
    console.error = patched;
    try {
      const mod = await import("@neslinesli93/qpdf-wasm");
      const createModule = (mod.default ?? mod) as unknown as CreateModule;
      const qpdf = await createModule({
        locateFile: () => QPDF_WASM_URL,
        noInitialRun: true,
      });
      const result = runWith(qpdf);
      return { result, stderr };
    } finally {
      // Restore defensively: only un-patch if no one else replaced it meanwhile.
      if (console.error === patched) console.error = originalError;
    }
  });
}
