import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getErrorMessage } from "@/lib/errors";
import en from "@/i18n/dictionaries/en.json";
import { JPEG_3x2, solidPng, stubBrowserDecoder } from "@/lib/pdf/testImages";
import {
  compressImages,
  OutputFormatUnsupportedError,
  type ImageEncoders,
  type OutputFormat,
} from "./compressImage";
import { normalizeImageFile } from "./heic";

// The HEIC decoder (libheif wasm) stands in as a fixed JPEG.
vi.mock("heic-to/next", () => ({
  heicTo: async () => new Blob([new Uint8Array(JPEG_3x2)], { type: "image/jpeg" }),
}));

beforeAll(stubBrowserDecoder);
afterAll(() => {
  vi.unstubAllGlobals();
});

const pad = (bytes: Uint8Array, extra: number) => {
  const out = new Uint8Array(bytes.length + extra);
  out.set(bytes);
  return out;
};

const file = (bytes: Uint8Array, name: string, type: string) =>
  new File([new Uint8Array(bytes)], name, { type });

/** A 3×2 JPEG of the given total size (trailing bytes after the image). */
const jpegOfSize = (size: number) => pad(JPEG_3x2, size - JPEG_3x2.length);

const blob = (bytes: Uint8Array) => new Blob([new Uint8Array(bytes)]);

/** Encoders that hand back fixed bytes, recording which path ran. */
function encoders(compress: Uint8Array | null, redraw: Uint8Array | null) {
  const calls: string[] = [];
  const fixed: ImageEncoders = {
    compress: async () => {
      calls.push("compress");
      if (!compress) throw new Error("compress unavailable");
      return blob(compress);
    },
    redraw: async () => {
      calls.push("redraw");
      if (!redraw) throw new Error("redraw unavailable");
      return blob(redraw);
    },
  };
  return { fixed, calls };
}

const run = (files: File[], outputFormat: OutputFormat, enc: ImageEncoders) =>
  compressImages({ files, quality: 80, outputFormat }, enc);

const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe("compressImages", () => {
  it("offers a same-format output that came out smaller", async () => {
    const out = jpegOfSize(2000);
    const { fixed } = encoders(out, null);
    const res = await run([file(jpegOfSize(3000), "photo.jpg", "image/jpeg")], "image/jpeg", fixed);
    expect(res.kind).toBe("compressed");
    if (res.kind !== "compressed") return;
    expect(res.type).toBe("single");
    expect(res.filename).toBe("photo.jpg");
    expect(res.data).toEqual(out);
    expect(res.images[0].keptOriginal).toBe(false);
  });

  it("reports 'could not shrink', with nothing to download, when a single file did not get smaller", async () => {
    const { fixed } = encoders(jpegOfSize(3000), null);
    const res = await run([file(jpegOfSize(3000), "photo.jpg", "image/jpeg")], "image/jpeg", fixed);
    expect(res.kind).toBe("not-smaller");
    expect(res).not.toHaveProperty("data");
    expect(res.images[0].keptOriginal).toBe(true);
  });

  it("judges the format by the bytes: a JPEG without a MIME type that did not shrink is kept", async () => {
    const { fixed } = encoders(null, jpegOfSize(3000));
    const res = await run([file(jpegOfSize(2000), "photo.jpg", "")], "image/jpeg", fixed);
    expect(res.kind).toBe("not-smaller");
  });

  it("offers a larger format conversion: it is what the user asked for", async () => {
    const out = pad(solidPng(3, 2), 2000);
    const { fixed } = encoders(null, out);
    const res = await run([file(jpegOfSize(1200), "photo.jpg", "image/jpeg")], "image/png", fixed);
    expect(res.kind).toBe("compressed");
    if (res.kind !== "compressed") return;
    expect(res.filename).toBe("photo.png");
    expect(res.data).toEqual(out);
  });

  it("offers a HEIC photo turned into a larger JPEG: the HEIC → JPEG step is a conversion", async () => {
    const heic = await normalizeImageFile(file(Uint8Array.from([0, 1]), "IMG_0001.HEIC", ""));
    const { fixed } = encoders(jpegOfSize(heic.size + 400), null);
    const res = await run([heic], "image/jpeg", fixed);
    expect(res.kind).toBe("compressed");
  });

  describe("a batch", () => {
    it("zips the originals of files that did not shrink, marked per file", async () => {
      const shrinks = file(jpegOfSize(3000), "a.jpg", "image/jpeg");
      const stays = file(jpegOfSize(1500), "b.jpg", "image/jpeg");
      const { fixed } = encoders(jpegOfSize(2500), null);
      const res = await run([shrinks, stays], "image/jpeg", fixed);
      expect(res.kind).toBe("compressed");
      if (res.kind !== "compressed") return;
      expect(res.type).toBe("zip");
      expect(res.images.map((i) => i.keptOriginal)).toEqual([false, true]);
      const zip = await JSZip.loadAsync(res.data);
      expect(await zip.file("a.jpg")!.async("uint8array")).toEqual(jpegOfSize(2500));
      expect(await zip.file("b.jpg")!.async("uint8array")).toEqual(await bytesOf(stays));
    });

    it("reports 'could not shrink' when no file got smaller", async () => {
      const { fixed } = encoders(jpegOfSize(3000), null);
      const res = await run(
        [file(jpegOfSize(2000), "a.jpg", "image/jpeg"), file(jpegOfSize(2800), "b.jpg", "image/jpeg")],
        "image/jpeg",
        fixed,
      );
      expect(res.kind).toBe("not-smaller");
    });

    it("keeps both files when two inputs end up with the same name", async () => {
      const heic = await normalizeImageFile(file(Uint8Array.from([0, 1]), "IMG_0001.HEIC", ""));
      const jpeg = file(jpegOfSize(3000), "IMG_0001.JPG", "image/jpeg");
      const { fixed } = encoders(jpegOfSize(1200), null);
      const res = await run([heic, jpeg], "image/jpeg", fixed);
      expect(res.kind).toBe("compressed");
      if (res.kind !== "compressed") return;
      expect(res.images.map((i) => i.name)).toEqual(["IMG_0001.jpg", "IMG_0001 (2).jpg"]);
      const zip = await JSZip.loadAsync(res.data);
      expect(Object.keys(zip.files).sort()).toEqual(["IMG_0001 (2).jpg", "IMG_0001.jpg"]);
    });
  });

  describe("a damaged output", () => {
    it("is recovered by redrawing on a canvas when the compression library changed its size", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const jpegIn = file(jpegOfSize(3000), "a.jpg", "image/jpeg");
      const redrawn = jpegOfSize(2000);
      const { fixed, calls } = encoders(jpegWithWidth(2), redrawn);
      const res = await run([jpegIn], "image/jpeg", fixed);
      expect(calls).toEqual(["compress", "redraw"]);
      expect(res.kind).toBe("compressed");
      if (res.kind !== "compressed") return;
      expect(res.data).toEqual(redrawn);
    });

    it("blocks with the tool's corrupt-output message when no recovery helps", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { fixed } = encoders(null, Uint8Array.from([0xff, 0xd8, 0, 0]));
      const err = await run([file(solidPng(3, 2), "a.png", "image/png")], "image/jpeg", fixed).catch(
        (e: unknown) => e,
      );
      expect(getErrorMessage(err, { copy: en.common.errors, corruptOutputHint: "hint" }).message).toBe("hint");
    });

    it("says which format the browser could not write when the canvas fell back to PNG", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { fixed } = encoders(null, solidPng(3, 2));
      const err = await run([file(JPEG_3x2, "a.jpg", "image/jpeg")], "image/webp", fixed).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(OutputFormatUnsupportedError);
      if (err instanceof OutputFormatUnsupportedError) expect(err.format).toBe("image/webp");
    });

    it("names the format even when the fallback PNG came out larger, not 'could not shrink'", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      // WebP → WebP goes through the library; both encoders fall back to PNG.
      const png = pad(solidPng(3, 2), 5000);
      const { fixed } = encoders(png, png);
      const input = file(pad(solidPng(3, 2), 100), "a.webp", "image/webp");
      const err = await run([input], "image/webp", fixed).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(OutputFormatUnsupportedError);
    });
  });
});

/** JPEG_3x2 with its frame header rewritten to `width` wide: a size change. */
function jpegWithWidth(width: number): Uint8Array {
  const bytes = Uint8Array.from(JPEG_3x2);
  for (let i = 0; i < bytes.length - 8; i++) {
    // SOF0: marker (2), length (2), precision (1), height (2), width (2).
    if (bytes[i] === 0xff && bytes[i + 1] === 0xc0) {
      bytes[i + 7] = width >> 8;
      bytes[i + 8] = width & 0xff;
      return bytes;
    }
  }
  throw new Error("no SOF0 in JPEG_3x2");
}
