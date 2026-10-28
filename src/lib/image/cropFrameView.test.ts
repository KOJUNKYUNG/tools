import { describe, expect, it } from "vitest";
import { containBox, frameInBox, pointInSource, standInRect } from "./cropFrameView";

describe("containBox", () => {
  it("letterboxes a wide picture in a taller element, centred vertically", () => {
    expect(containBox({ w: 640, h: 480 }, { w: 3840, h: 2160 })).toEqual({
      x: 0,
      y: 60,
      w: 640,
      h: 360,
    });
  });

  it("pillarboxes a tall picture in a wider element, centred horizontally", () => {
    expect(containBox({ w: 640, h: 320 }, { w: 3024, h: 4032 })).toEqual({
      x: 200,
      y: 0,
      w: 240,
      h: 320,
    });
  });

  it("is empty until both sizes are known", () => {
    const empty = { x: 0, y: 0, w: 0, h: 0 };
    expect(containBox({ w: 0, h: 320 }, { w: 3840, h: 2160 })).toEqual(empty);
    expect(containBox({ w: 640, h: 320 }, { w: 0, h: 0 })).toEqual(empty);
  });
});

describe("frameInBox", () => {
  const source = { w: 3840, h: 2160 };
  const element = { w: 640, h: 480 };
  const crop = { x: 960, y: 540, width: 1920, height: 1080 };

  it("places a frame in source pixels on the shown picture", () => {
    const box = containBox(element, source);
    expect(frameInBox(crop, box, source)).toEqual({ x: 160, y: 150, w: 320, h: 180 });
  });

  it("lands in the same place whether the full picture or a smaller stand-in is shown", () => {
    const standIn = { w: 1280, h: 720 };
    const box = containBox(element, standIn);
    expect(frameInBox(crop, box, source)).toEqual({ x: 160, y: 150, w: 320, h: 180 });
  });
});

describe("pointInSource", () => {
  const source = { w: 3840, h: 2160 };

  it("reads a point on the shown stand-in as source pixels", () => {
    // A 1280 × 720 stand-in letterboxed in a 640 × 480 element: box 640 × 360 at y 60.
    const box = containBox({ w: 640, h: 480 }, { w: 1280, h: 720 });
    expect(pointInSource({ x: 320, y: 240 }, box, source)).toEqual({ x: 1920, y: 1080 });
    expect(pointInSource({ x: 32, y: 60 }, box, source)).toEqual({ x: 192, y: 0 });
  });
});

describe("frameInBox and pointInSource", () => {
  it("read each other back on a pillarboxed portrait picture", () => {
    // 3024 × 4032 in a 640 × 320 element: box 240 × 320 at x 200.
    const source = { w: 3024, h: 4032 };
    const box = containBox({ w: 640, h: 320 }, source);
    const crop = { x: 756, y: 1008, width: 1512, height: 2016 };
    const frame = frameInBox(crop, box, source);
    expect(frame).toEqual({ x: 260, y: 80, w: 120, h: 160 });
    expect(pointInSource({ x: frame.x, y: frame.y }, box, source)).toEqual({ x: 756, y: 1008 });
  });
});

describe("standInRect", () => {
  const source = { w: 3840, h: 2160 };
  const standIn = { w: 1280, h: 720 };

  it("finds a frame held in the source's pixels on a smaller stand-in of it", () => {
    expect(standInRect({ x: 960, y: 540, width: 1920, height: 1080 }, source, standIn, 16 / 9)).toEqual({
      x: 320,
      y: 180,
      w: 640,
      h: 360,
    });
  });

  it("without a frame, takes the centred part that covers the box's aspect", () => {
    expect(standInRect(null, source, standIn, 4 / 3)).toEqual({ x: 160, y: 0, w: 960, h: 720 });
    expect(standInRect(null, source, standIn, 16 / 9)).toEqual({ x: 0, y: 0, w: 1280, h: 720 });
    // A box wider than the picture: bands off the top and bottom.
    expect(standInRect(null, source, standIn, 32 / 9)).toEqual({ x: 0, y: 180, w: 1280, h: 360 });
  });
});
