export interface PptxIntegrityInput {
  originalEntryNames: string[];
  outputEntryNames: string[];
  originalSlideCount: number;
  outputSlideCount: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Defense-in-depth against a silently broken repackage. We only replace media
 * BYTES (never add/remove/rename entries, never touch slide XML), so the output
 * MUST contain exactly the same entry set and slide count. Any drift means the
 * output is unsafe to hand to PowerPoint.
 *
 * Throws with a `CORRUPT_OUTPUT:` prefix so getErrorMessage() maps it to the
 * friendly corrupt-output hint (see src/lib/errors.ts).
 */
export function assertPptxIntegrity(input: PptxIntegrityInput): void {
  const {
    originalEntryNames,
    outputEntryNames,
    originalSlideCount,
    outputSlideCount,
    compressedSize,
  } = input;

  if (compressedSize <= 0) {
    throw new Error("CORRUPT_OUTPUT: empty output");
  }

  if (originalEntryNames.length !== outputEntryNames.length) {
    throw new Error("CORRUPT_OUTPUT: entry count changed");
  }

  const out = new Set(outputEntryNames);
  for (const name of originalEntryNames) {
    if (!out.has(name)) {
      throw new Error("CORRUPT_OUTPUT: entry missing in output");
    }
  }

  if (originalSlideCount !== outputSlideCount) {
    throw new Error("CORRUPT_OUTPUT: slide count changed");
  }
}
