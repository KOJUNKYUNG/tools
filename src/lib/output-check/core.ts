/**
 * Output-check core (see CONTEXT.md → Output correctness).
 *
 * A tool's **output property checker** compares its result against the input
 * and the user's request and returns the violated properties. One checker
 * serves both layers: the run-time output check calls it at `quick` depth,
 * the regression set at `full` depth.
 */

import { CORRUPT_OUTPUT_PREFIX } from "@/lib/errors";

/** `quick`: cheap properties, run on every run. `full`: every property. */
export type CheckDepth = "quick" | "full";

export interface Violation {
  /** Stable id of the violated output property, e.g. `slide-count`. */
  property: string;
  /** Developer-facing detail (part name, counts). Never shown to the user. */
  detail: string;
}

const violationKey = (v: Violation) => `${v.property}|${v.detail}`;

/**
 * The violations in `found` that `inherited` (the same check on the input)
 * does not also have: defects the input already had are not the tool's doing.
 */
export function notInherited(found: Violation[], inherited: Violation[]): Violation[] {
  const had = new Set(inherited.map(violationKey));
  return found.filter((v) => !had.has(violationKey(v)));
}

export type OutputChecker<TInput, TRequest, TOutput> = (
  input: TInput,
  request: TRequest,
  output: TOutput,
  depth: CheckDepth,
) => Promise<Violation[]>;

export interface RunOutputCheckOptions<T> {
  /** Tool slug, for the developer log and the error detail. */
  tool: string;
  output: T;
  /** The tool's checker, bound to its input and request at `quick` depth. */
  check: (output: T) => Promise<Violation[]>;
  /** A safer result to fall back to (re-run in a safe mode, the original). */
  recover?: () => Promise<T>;
}

function devLog(message: string, violations: Violation[] | unknown): void {
  // Development builds only; nothing is collected (no telemetry).
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[output-check] ${message}`, violations);
  }
}

/**
 * The run-time output check: hand back a checked result, recover silently,
 * or block. Blocking throws the existing corrupt-output error, which the
 * tool's `corruptOutputHint` turns into its plain-language message. It never
 * warns and then allows.
 *
 * A checker that crashes has not proven the file wrong, so the result is
 * handed back: only certain defects may block a user. Damage the file itself
 * causes (a part that cannot be read) is not a crash: inspectors report it
 * as a violation, so it blocks. The regression set calls checkers directly,
 * so a checker bug fails the tests instead of passing silently.
 */
export async function runOutputCheck<T>({
  tool,
  output,
  check,
  recover,
}: RunOutputCheckOptions<T>): Promise<T> {
  let violations: Violation[];
  try {
    violations = await check(output);
  } catch (err) {
    devLog(`${tool}: check crashed, result handed back unchecked`, err);
    return output;
  }
  if (violations.length === 0) return output;

  if (recover) {
    // A recovery that throws simply failed: fall through to blocking.
    const recovered = await recover().catch(() => null);
    if (recovered !== null) {
      const after = await check(recovered).catch((): Violation[] => []);
      if (after.length === 0) {
        devLog(`${tool}: recovered`, violations);
        return recovered;
      }
    }
  }

  devLog(`${tool}: blocked`, violations);
  throw new Error(
    `${CORRUPT_OUTPUT_PREFIX}: ${tool}: ${violations.map((v) => v.property).join(", ")}`,
  );
}
