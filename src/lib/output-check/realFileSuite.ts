/**
 * The real-file half of the regression set (`pnpm test:real`; see
 * CONTEXT.md → Output correctness). Local-only: excluded from `pnpm test`,
 * `pnpm verify` and CI. Run it on demand and before bumping a pinned engine.
 *
 * Each registered tool's engine entry runs over every applicable file in the
 * fixture folder (`realFixtureDir()`) with its default and representative
 * requests, and the tool's checker runs at `full` depth on each result.
 * Properties are relative to the input, so a new fixture is picked up just
 * by dropping it in the folder: no expected values to record.
 *
 * Registering a tool: next to its engine, add `<engine>.real.ts` that calls
 * `realFileSuite({ tool, extensions, requests, run, check })`. Only
 * Node-runnable entries qualify; stub any browser global the entry needs
 * (as `changeBackground.real.ts` does for `Image`) in that file.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { OutputChecker } from "./core";
import { findRealFixtures, realFixtureDir } from "./realFixtures";

/** The quick check should add at most ~20% to processing time (spec #51). */
const QUICK_BUDGET = 0.2;

export interface RealFileRequest<TRequest> {
  /** Short name shown in failures, e.g. `all-slides (default)`. */
  label: string;
  request: TRequest;
}

export interface RealFileTool<TRequest, TOutput> {
  /** Tool slug, used as the suite name. */
  tool: string;
  /** File extensions the tool accepts, e.g. `[".pptx"]`. */
  extensions: readonly string[];
  /** The default request first, then representative ones. May read the input. */
  requests: (input: Uint8Array) => Promise<RealFileRequest<TRequest>[]>;
  /** The tool's engine entry, which runs its own `quick` output check. */
  run: (
    input: Uint8Array,
    request: TRequest,
    fileName: string,
  ) => Promise<TOutput>;
  check: OutputChecker<Uint8Array, TRequest, TOutput>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const ms = (n: number) => `${Math.round(n)} ms`;

export function realFileSuite<TRequest, TOutput>(
  suite: RealFileTool<TRequest, TOutput>,
): void {
  describe(suite.tool, () => {
    const dir = realFixtureDir();
    let files: string[];
    try {
      files = findRealFixtures(dir, suite.extensions);
    } catch (err) {
      it("finds applicable fixtures", () => {
        throw err;
      });
      return;
    }

    // The entry runs the quick check itself, so processing time is estimated
    // as entry time minus a separate, identical quick-check run. That run is
    // warm, so the reported share is an estimate that may run slightly low.
    const timing = { entry: 0, quick: 0, runs: 0 };

    for (const file of files) {
      const name = path.relative(dir, file);
      it(name, async () => {
        const input = new Uint8Array(readFileSync(file));
        const failures: string[] = [];

        for (const { label, request } of await suite.requests(input)) {
          const started = performance.now();
          let output: TOutput;
          try {
            output = await suite.run(input, request, path.basename(file));
          } catch (err) {
            failures.push(`${label}: entry threw: ${errorMessage(err)}`);
            continue;
          }
          const ran = performance.now();
          await suite.check(input, request, output, "quick");
          timing.quick += performance.now() - ran;
          timing.entry += ran - started;
          timing.runs++;

          for (const v of await suite.check(input, request, output, "full")) {
            failures.push(`${label}: ${v.property}: ${v.detail}`);
          }
        }

        expect(failures, `violations in ${name}`).toEqual([]);
      });
    }

    afterAll(() => {
      if (timing.runs === 0) return;
      const processing = Math.max(timing.entry - timing.quick, 1);
      const share = timing.quick / processing;
      const verdict = share <= QUICK_BUDGET ? "within" : "OVER";
      console.log(
        `[test:real] ${suite.tool}: ${timing.runs} runs, ` +
          `processing ≈ ${ms(processing)}, quick check ${ms(timing.quick)} ` +
          `(≈ +${(share * 100).toFixed(1)}%, ` +
          `${verdict} the ${QUICK_BUDGET * 100}% budget)`,
      );
    });
  });
}
