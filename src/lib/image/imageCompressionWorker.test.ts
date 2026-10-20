import { describe, expect, it } from "vitest";
import { IMAGE_COMPRESSION_LIB_PATH, imageCompressionWorker } from "./imageCompressionWorker";

describe("imageCompressionWorker", () => {
  it("runs in a worker that loads the library from this site, not a CDN", () => {
    const options = imageCompressionWorker("https://ontab.example");
    expect(options.useWebWorker).toBe(true);
    const url = new URL(options.libURL);
    expect(url.origin).toBe("https://ontab.example");
    expect(url.pathname).toBe(IMAGE_COMPRESSION_LIB_PATH);
  });

  it("gives an absolute URL, which a blob: worker can resolve", () => {
    // The library's worker is a blob: URL; a root-relative path does not
    // resolve against it.
    const { libURL } = imageCompressionWorker("http://localhost:3000");
    expect(() => new URL(libURL, "blob:http://localhost:3000/x")).not.toThrow();
    expect(libURL).toMatch(/^http:\/\/localhost:3000\//);
  });
});
