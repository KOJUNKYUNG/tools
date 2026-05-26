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
}

const ADVANCED_PARAMS: Record<
  CompressionPreset,
  { jpegQuality: number; maxDpi: number; stripMetadata: boolean }
> = {
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
  const mod = await import("@kihyun1998/justpdf-compress-wasm");
  const init = mod.default;
  const { compress_advanced } = mod;
  await init();
  onProgress?.(30);

  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  onProgress?.(50);

  const params = ADVANCED_PARAMS[preset];
  // font_subsetting=false: the upstream WASM's subsetter corrupts glyph maps on
  // several Korean fonts (full doc AND pdf-lib-extracted subsets). Skipping it
  // gives reliable output across all PDFs at a modest compression-ratio cost.
  const result = compress_advanced(
    pdfBytes,
    params.jpegQuality,
    params.maxDpi,
    /* font_subsetting */ false,
    /* remove_unused_resources */ true,
    /* strip_metadata */ params.stripMetadata,
    /* strip_extras */ false,
    /* grayscale */ false,
  );
  onProgress?.(90);

  const data = result.data();
  const summary: CompressPdfResult = {
    data,
    originalSize: result.original_size,
    compressedSize: result.compressed_size,
    ratio: result.ratio,
  };
  result.free();
  onProgress?.(100);
  return summary;
}

// Re-export the same implementation so the live-preview call site doesn't need
// to change. (They share identical semantics now — preview and final match.)
export type CompressPdfLivePreviewOptions = CompressPdfOptions;
export const compressPdfLivePreview = compressPdf;
