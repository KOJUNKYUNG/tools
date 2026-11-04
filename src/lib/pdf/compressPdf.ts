import type { CompressionPreset } from "@/lib/common/compressionPreset";
import { runOutputCheck } from "@/lib/output-check/core";
import { notSmaller, SIZE_BOUND } from "@/lib/output-check/sizeBound";
import { checkPdfCompress, REFERENCES_RESOLVE } from "./pdfCompressCheck";
import { toPlainPdf } from "./plainPdf";
import { hasInvalidSoftMask } from "./softMaskCheck";

export interface CompressPdfOptions {
  file: File;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

/**
 * What a compression run hands back. "not-smaller" is not an error: the
 * output came out no smaller than the input, so there is nothing to offer and
 * the original is not passed off as compressed (spec #51, decided in #60).
 */
export type CompressPdfResult =
  | {
      kind: "compressed";
      data: Uint8Array;
      originalSize: number;
      compressedSize: number;
      /**
       * True when the chosen preset's output was damaged and the file was
       * re-compressed without image re-encoding instead (see pdfCompressCheck.ts).
       * Not when only the file's structure was rewritten: the preset still applied.
       */
      imageReencodeSkipped: boolean;
    }
  | {
      kind: "not-smaller";
      originalSize: number;
      compressedSize: number;
      /**
       * As above. A stronger preset would recover the same way, so it cannot
       * help: the tool must not suggest one.
       */
      imageReencodeSkipped: boolean;
    };

interface PresetParams {
  jpegQuality: number;
  maxDpi: number;
  stripMetadata: boolean;
}

const ADVANCED_PARAMS: Record<CompressionPreset, PresetParams> = {
  // jpegQuality=0 → skip image re-encoding; maxDpi=0 → skip downscaling.
  low:    { jpegQuality: 0,  maxDpi: 0,   stripMetadata: false },
  medium: { jpegQuality: 75, maxDpi: 0,   stripMetadata: false },
  high:   { jpegQuality: 65, maxDpi: 150, stripMetadata: true  },
};

export async function compressPdf({
  file,
  preset,
  onProgress,
}: CompressPdfOptions): Promise<CompressPdfResult> {
  onProgress?.(10);
  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  return compressPdfFromBytes({ bytes: pdfBytes, preset, onProgress });
}

export interface CompressPdfFromBytesOptions {
  bytes: Uint8Array;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

export async function compressPdfFromBytes({
  bytes,
  preset,
  onProgress,
}: CompressPdfFromBytesOptions): Promise<CompressPdfResult> {
  const mod = await import("@kihyun1998/justpdf-compress-wasm");
  const init = mod.default;
  const { compress_advanced } = mod;
  await init();
  // Emit 30% only after the slow WASM init resolves — otherwise the bar
  // jumps to 30 instantly and stalls during init on first run.
  onProgress?.(30);
  onProgress?.(50);

  // What the compressor reads: the file, or its plain rewrite once recovering.
  // The check always judges against the file itself.
  let source = bytes;
  let imageReencodeSkipped = false;

  const run = (params: PresetParams): Uint8Array => {
    // font_subsetting=false: the upstream WASM's subsetter corrupts glyph maps on
    // several Korean fonts (full doc AND pdf-lib-extracted subsets). Skipping it
    // gives reliable output across all PDFs at a modest compression-ratio cost.
    const result = compress_advanced(
      source,
      params.jpegQuality,
      params.maxDpi,
      /* font_subsetting */ false,
      /* remove_unused_resources */ true,
      /* strip_metadata */ params.stripMetadata,
      /* strip_extras */ false,
      /* grayscale */ false,
    );
    try {
      return result.data();
    } finally {
      result.free();
    }
  };

  const params = ADVANCED_PARAMS[preset];
  const first = run(params);
  onProgress?.(90);

  // Damage is checked first: a damaged output is recovered or blocked whatever
  // its size. Not shrinking is an outcome, handled after.
  const output = await runOutputCheck({
    tool: "pdf-compress",
    output: first,
    check: async (out) =>
      (await checkPdfCompress(bytes, { preset }, out, "quick")).filter(
        (v) => v.property !== SIZE_BOUND,
      ),
    recover: async (violations) => {
      const reencodesImages = params.jpegQuality !== 0;
      // Objects it could not read: it reads the same document without the
      // structure it misreads (see plainPdf.ts), at the preset's own settings.
      if (violations.some((v) => v.property === REFERENCES_RESOLVE)) {
        source = await toPlainPdf(bytes);
        const out = run(params);
        const newBadMask = reencodesImages && hasInvalidSoftMask(out) && !hasInvalidSoftMask(bytes);
        if (!newBadMask) return out;
      } else if (!reencodesImages) {
        throw new Error("Light never re-encodes: it has no safer setting to fall back to");
      }
      // Image re-encoding is where the compressor goes wrong (it rewrote soft
      // masks as RGB JPEGs, which some viewers drop): redo the file with Light's
      // image settings, keeping the preset's metadata choice.
      imageReencodeSkipped = true;
      return run({ ...ADVANCED_PARAMS.low, stripMetadata: params.stripMetadata });
    },
  });
  onProgress?.(100);

  const sizes = {
    originalSize: bytes.byteLength,
    compressedSize: output.byteLength,
    imageReencodeSkipped,
  };
  return notSmaller(bytes, output)
    ? { kind: "not-smaller", ...sizes }
    : { kind: "compressed", data: output, ...sizes };
}
