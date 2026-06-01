// Pure filename derivation for the pdf-lock tool output. Mirrors the shape of
// watermarkNaming.ts: strip a trailing .pdf (case-insensitive), append a
// mode-specific suffix, re-add .pdf. Empty name → "output".

export type LockMode = "lock" | "unlock";

const SUFFIX: Record<LockMode, string> = {
  lock: "-locked",
  unlock: "-unlocked",
};

/**
 * `"doc.pdf"` + lock → `"doc-locked.pdf"`; `"doc.pdf"` + unlock →
 * `"doc-unlocked.pdf"`; `""` → `"output-locked.pdf"`.
 */
export function deriveLockedName(originalName: string, mode: LockMode): string {
  const base = originalName
    ? originalName.toLowerCase().endsWith(".pdf")
      ? originalName.slice(0, -4)
      : originalName
    : "output";
  return `${base}${SUFFIX[mode]}.pdf`;
}
