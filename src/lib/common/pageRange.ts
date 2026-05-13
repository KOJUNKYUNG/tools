/**
 * Parse a 1-based range expression like "1, 3, 5-7" into a Set of indices.
 * Lenient: silently drops invalid tokens (logs in dev). Clamps to [1, totalPages].
 * Reversed ranges (e.g. "5-3") are normalised. Empty input → empty Set.
 *
 * This module is intentionally testable as pure functions. Automated tests
 * are deferred until vitest is introduced.
 */
export function parseRange(input: string, totalPages: number): Set<number> {
  const result = new Set<number>();
  if (!input || totalPages <= 0) return result;

  const tokens = input
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n >= 1 && n <= totalPages) result.add(n);
      continue;
    }
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let a = parseInt(rangeMatch[1], 10);
      let b = parseInt(rangeMatch[2], 10);
      if (a > b) [a, b] = [b, a];
      const lo = Math.max(1, a);
      const hi = Math.min(totalPages, b);
      for (let i = lo; i <= hi; i++) result.add(i);
      continue;
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[pageRange] dropping invalid token: "${token}"`);
    }
  }

  return result;
}

/**
 * Serialize a Set of 1-based indices into a canonical "1, 3, 5-7" string.
 * Sorted ascending, contiguous runs collapsed. Empty Set → empty string.
 */
export function serializeRange(indices: Set<number>): string {
  if (indices.size === 0) return "";
  const sorted = [...indices].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const segments: string[] = [];
  let runStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    segments.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);
    runStart = n;
    prev = n;
  }
  segments.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);

  return segments.join(", ");
}
