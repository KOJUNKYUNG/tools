import { describe, expect, it } from "vitest";
import { IMAGE_COMPRESSION_LIB_PATH, imageCompressionWorkerOptions } from "./imageCompressionWorker";

describe("imageCompressionWorkerOptions", () => {
  it("runs in a worker that loads the library from this site, not a CDN", () => {
    const options = imageCompressionWorkerOptions("https://ontab.example");
    expect(options.useWebWorker).toBe(true);
    const url = new URL(options.libURL);
    expect(url.origin).toBe("https://ontab.example");
    expect(url.pathname).toBe(IMAGE_COMPRESSION_LIB_PATH);
  });

  it("gives an absolute URL, since the path alone does not resolve in a blob: worker", () => {
    const workerBase = "blob:http://localhost:3000/x";
    expect(() => new URL(IMAGE_COMPRESSION_LIB_PATH, workerBase)).toThrow();
    const { libURL } = imageCompressionWorkerOptions("http://localhost:3000");
    expect(new URL(libURL, workerBase).href).toBe(
      `http://localhost:3000${IMAGE_COMPRESSION_LIB_PATH}`,
    );
  });
});
