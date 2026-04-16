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
