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

const PRESET_MAP: Record<CompressionPreset, string> = {
  low: "low",
  medium: "medium",
  high: "high",
};

export async function compressPdf({
  file,
  preset,
  onProgress,
}: CompressPdfOptions): Promise<CompressPdfResult> {
  onProgress?.(10);

  const init = (await import("@kihyun1998/justpdf-compress-wasm")).default;
  const { compress } = await import("@kihyun1998/justpdf-compress-wasm");

  await init();
  onProgress?.(30);

  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  onProgress?.(50);

  const result = compress(pdfBytes, PRESET_MAP[preset]);
  onProgress?.(90);

  const compressedData = result.data();
  const summary: CompressPdfResult = {
    data: compressedData,
    originalSize: result.original_size,
    compressedSize: result.compressed_size,
    ratio: result.ratio,
  };

  result.free();
  onProgress?.(100);

  return summary;
}

export interface CompressPdfLivePreviewOptions {
  file: File;
  preset: CompressionPreset;
  onProgress?: (pct: number) => void;
}

const LIVE_PARAMS: Record<
  CompressionPreset,
  { jpegQuality: number; maxDpi: number; stripMetadata: boolean }
> = {
  low:    { jpegQuality: 0,  maxDpi: 0,   stripMetadata: false },
  medium: { jpegQuality: 75, maxDpi: 0,   stripMetadata: false },
  high:   { jpegQuality: 65, maxDpi: 150, stripMetadata: true  },
};

/**
 * Compress a single-page PDF extract for live preview purposes.
 *
 * Uses compress_advanced with font_subsetting=false to avoid a known CJK
 * glyph-map corruption that occurs when pdf-lib reconstructs a 1-page subset
 * and the WASM subsetter re-subsets the already-subset font tables.
 * Visual quality (JPEG + DPI) is identical to the full preset path.
 */
export async function compressPdfLivePreview({
  file,
  preset,
  onProgress,
}: CompressPdfLivePreviewOptions): Promise<CompressPdfResult> {
  onProgress?.(10);
  const mod = await import("@kihyun1998/justpdf-compress-wasm");
  const init = mod.default;
  const { compress_advanced } = mod;
  await init();
  onProgress?.(30);

  const arrayBuffer = await file.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);
  onProgress?.(50);

  const params = LIVE_PARAMS[preset];
  // font_subsetting=false avoids a known CJK glyph-map corruption on
  // pdf-lib-recreated 1-page subsets. The visual result is otherwise identical
  // to compress(data, preset) for image quality and DPI.
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
