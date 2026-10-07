import { assertCompressedPdfIntegrity, CORRUPT_OUTPUT_MARKER } from "./compressPdfIntegrity";
import { hasInvalidSoftMask } from "./softMaskCheck";

export type CompressionPreset = "low" | "medium" | "high";

export interface CompressPdfOptions {
  file: File;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

export interface CompressPdfResult {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number;
  /**
   * True when the chosen preset produced an invalid soft mask and the file was
   * re-compressed without image re-encoding instead (see softMaskCheck.ts).
   */
  imageReencodeSkipped: boolean;
}

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
  const { compress_advanced, analyze } = mod;
  await init();
  // Emit 30% only after the slow WASM init resolves — otherwise the bar
  // jumps to 30 instantly and stalls during init on first run.
  onProgress?.(30);
  onProgress?.(50);

  const run = (params: PresetParams) => {
    // font_subsetting=false: the upstream WASM's subsetter corrupts glyph maps on
    // several Korean fonts (full doc AND pdf-lib-extracted subsets). Skipping it
    // gives reliable output across all PDFs at a modest compression-ratio cost.
    const result = compress_advanced(
      bytes,
      params.jpegQuality,
      params.maxDpi,
      /* font_subsetting */ false,
      /* remove_unused_resources */ true,
      /* strip_metadata */ params.stripMetadata,
      /* strip_extras */ false,
      /* grayscale */ false,
    );
    try {
      return {
        data: result.data(),
        originalSize: result.original_size,
        compressedSize: result.compressed_size,
        ratio: result.ratio,
      };
    } finally {
      result.free();
    }
  };

  const params = ADVANCED_PARAMS[preset];
  let output = run(params);
  let imageReencodeSkipped = false;
  if (hasInvalidSoftMask(output.data)) {
    // Image re-encoding rewrote a soft mask as an RGB JPEG, which some viewers
    // drop. Redo this file without image re-encoding (Light's image settings),
    // keeping the preset's metadata choice. Light never re-encodes masks, so a
    // repeat means something else is wrong — refuse rather than ship it.
    if (params.jpegQuality === 0) {
      throw new Error(`${CORRUPT_OUTPUT_MARKER}: invalid soft mask`);
    }
    output = run({ ...ADVANCED_PARAMS.low, stripMetadata: params.stripMetadata });
    imageReencodeSkipped = true;
    if (hasInvalidSoftMask(output.data)) {
      throw new Error(`${CORRUPT_OUTPUT_MARKER}: invalid soft mask`);
    }
  }
  onProgress?.(90);

  const data = output.data;
  const summary: CompressPdfResult = { ...output, imageReencodeSkipped };

  // Run analyze() on source + output and verify page count survived.
  // Defense against upstream WASM silent corruption (3.2MB → 24KB pattern).
  let sourcePageCount = 0;
  let outputPageCount = 0;
  let outputAnalyzed = false;
  let srcResult: ReturnType<typeof analyze> | null = null;
  try {
    srcResult = analyze(bytes);
    sourcePageCount = srcResult.pages;
  } catch {
    // Source unanalyzable — fall back to header + ratio checks.
  } finally {
    srcResult?.free();
  }
  let outResult: ReturnType<typeof analyze> | null = null;
  try {
    outResult = analyze(data);
    outputPageCount = outResult.pages;
    outputAnalyzed = true;
  } catch {
    // Output unanalyzable — ratio + header branches still run; the
    // page-drop branch is gated on outputAnalyzed to avoid false-
    // positiving a healthy output whose structure trips the analyzer.
  } finally {
    outResult?.free();
  }
  assertCompressedPdfIntegrity({
    data,
    originalSize: summary.originalSize,
    compressedSize: summary.compressedSize,
    sourcePageCount,
    outputPageCount,
    outputAnalyzed,
  });

  onProgress?.(100);
  return summary;
}
