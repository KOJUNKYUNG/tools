// What to show in the size slot next to the preset description.
//
// Only measured sizes are shown. A modelled estimate (image share × per-preset
// ratio) used to fill the gap, but on a real 163 MB deck it said 57.8 MB for an
// actual 13.2 MB: the compressor skips some images entirely (ICC-based colour)
// and rewrites others (soft masks), neither of which a byte-share model can
// see. A wrong number presented as a prediction is worse than none.

export type SizeDisplay =
  | { kind: "actual"; size: number }
  | { kind: "computing" }
  | { kind: "afterCompress" };

export interface SelectSizeDisplayInput {
  /** Real size from the finished whole-doc live compress for the current file + preset. */
  actualCompressedSize: number | null;
  /** Whether the live whole-doc compress runs for this file (false above the size gate). */
  livePreview: boolean;
  /** The live compress for the current file + preset ended without a result. */
  liveFailed: boolean;
}

export function selectSizeDisplay({
  actualCompressedSize,
  livePreview,
  liveFailed,
}: SelectSizeDisplayInput): SizeDisplay {
  if (actualCompressedSize != null) return { kind: "actual", size: actualCompressedSize };
  if (livePreview && !liveFailed) return { kind: "computing" };
  return { kind: "afterCompress" };
}
