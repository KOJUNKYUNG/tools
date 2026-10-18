/**
 * A compressor's size bound (see CONTEXT.md → Output property): its output
 * must come out strictly smaller than the input. Failing it is an outcome,
 * not damage: the tool shows a "could not shrink" result with no download,
 * and never passes the original off as compressed.
 */
export const SIZE_BOUND = "size-bound";

const sizeOf = (file: Uint8Array | Blob) => (file instanceof Blob ? file.size : file.byteLength);

/** Whether `output` failed to shrink `input` (no percentage threshold). */
export const notSmaller = (input: Uint8Array | Blob, output: Uint8Array | Blob) =>
  sizeOf(output) >= sizeOf(input);
