import { afterEach, describe, expect, it, vi } from "vitest";
import type { GalleryImage } from "@/lib/gallery/types";
import { galleryImageFile, solidPictureFile } from "./backgroundFiles";

const image = (overrides: Partial<GalleryImage> = {}): GalleryImage => ({
  id: "gradient-dawn",
  category: "gradient",
  name: "dawn",
  format: "jpeg",
  url: "/gallery/gradient/dawn.jpg",
  thumbnailUrl: "/gallery/gradient/dawn-thumb.jpg",
  width: 3840,
  height: 2160,
  source: { kind: "own" },
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe("galleryImageFile", () => {
  it("fetches the gallery original and names it as a JPEG", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      return new Response(new Blob(["jpeg bytes"], { type: "image/jpeg" }));
    });

    const file = await galleryImageFile(image());

    expect(fetched).toEqual(["/gallery/gradient/dawn.jpg"]);
    expect(file.name).toBe("gallery-gradient-dawn.jpg");
    expect(file.type).toBe("image/jpeg");
    expect(await file.text()).toBe("jpeg bytes");
  });

  it("keeps a PNG original a PNG", async () => {
    vi.stubGlobal("fetch", async () => new Response(new Blob(["png bytes"], { type: "image/png" })));

    const file = await galleryImageFile(image({ id: "pattern-pixels", format: "png" }));

    expect(file.name).toBe("gallery-pattern-pixels.png");
    expect(file.type).toBe("image/png");
  });

  it("fails when the original cannot be loaded", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

    await expect(galleryImageFile(image())).rejects.toThrow("404");
  });
});

/** A stand-in canvas that records its fills and encodes as `<type>:<fill>`. */
class FakeCanvas {
  static made: FakeCanvas[] = [];
  fills: { style: string; rect: number[] }[] = [];
  constructor(
    public width: number,
    public height: number,
  ) {
    FakeCanvas.made.push(this);
  }
  getContext() {
    const canvas = this;
    return {
      fillStyle: "",
      fillRect(...rect: number[]) {
        canvas.fills.push({ style: this.fillStyle, rect });
      },
    };
  }
  async convertToBlob({ type }: { type: string }) {
    return new Blob([`${type}:${this.fills.map((f) => f.style).join(",")}`], { type });
  }
}

describe("solidPictureFile", () => {
  it("paints the colour over a 16:9 slide's 4K picture as a PNG", async () => {
    FakeCanvas.made = [];
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);

    const file = await solidPictureFile("1F2A44", { w: 16 / 9, h: 1 });

    expect(file.name).toBe("solid-1F2A44.png");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("image/png:#1F2A44");
    const [canvas] = FakeCanvas.made;
    expect(canvas.fills).toEqual([{ style: "#1F2A44", rect: [0, 0, 3840, 2160] }]);
  });

  it("sizes a 4:3 slide's picture to the 4K screen's height", async () => {
    FakeCanvas.made = [];
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);

    await solidPictureFile("FFFFFF", { w: 4, h: 3 });

    expect(FakeCanvas.made[0].fills[0].rect).toEqual([0, 0, 2880, 2160]);
  });

  it("sizes the picture for the deck's screen when given one", async () => {
    FakeCanvas.made = [];
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);

    await solidPictureFile("FFFFFF", { w: 4, h: 3 }, "full-hd");

    expect(FakeCanvas.made[0].fills[0].rect).toEqual([0, 0, 1440, 1080]);
  });

  it("releases the canvas once encoded", async () => {
    FakeCanvas.made = [];
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);

    await solidPictureFile("000000", { w: 16 / 9, h: 1 });

    expect(FakeCanvas.made[0]).toMatchObject({ width: 0, height: 0 });
  });
});
