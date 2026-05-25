export function downloadBlob(data: Uint8Array, filename: string, mime: string) {
  downloadBlobObject(new Blob([data.buffer as ArrayBuffer], { type: mime }), filename);
}

/**
 * Trigger a download for a Blob directly, with no Uint8Array round-trip. Use this
 * when you already hold a Blob (e.g. a canvas/toBlob result or a generated zip) to
 * avoid copying its bytes into a second buffer just to download them.
 */
export function downloadBlobObject(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
