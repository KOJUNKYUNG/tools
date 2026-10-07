import { describe, expect, it } from "vitest";
import { hasInvalidSoftMask } from "./softMaskCheck";

const enc = new TextEncoder();
const pdf = (body: string) => enc.encode(`%PDF-1.7\n${body}\n%%EOF\n`);

const image = (num: number, smaskNum: number) =>
  `${num} 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 ` +
  `/ColorSpace /DeviceRGB /SMask ${smaskNum} 0 R /Filter /FlateDecode /Length 4 >>\nstream\nxxxx\nendstream\nendobj\n`;

const mask = (num: number, colorSpace: string, filter = "/FlateDecode") =>
  `${num} 0 obj\n<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /BitsPerComponent 8 ` +
  `/ColorSpace ${colorSpace} /Filter ${filter} /Length 4 >>\nstream\nyyyy\nendstream\nendobj\n`;

describe("hasInvalidSoftMask", () => {
  it("is false for a PDF without soft masks", () => {
    expect(hasInvalidSoftMask(pdf(mask(1, "/DeviceRGB")))).toBe(false);
  });

  it("is false when every soft mask is DeviceGray", () => {
    expect(hasInvalidSoftMask(pdf(image(1, 2) + mask(2, "/DeviceGray")))).toBe(false);
  });

  it("flags a soft mask re-encoded as an RGB JPEG (the upstream compressor defect)", () => {
    expect(hasInvalidSoftMask(pdf(image(1, 2) + mask(2, "/DeviceRGB", "/DCTDecode")))).toBe(true);
  });

  it("finds the mask object wherever it sits relative to the image", () => {
    expect(hasInvalidSoftMask(pdf(mask(9, "/DeviceRGB", "/DCTDecode") + image(1, 9)))).toBe(true);
  });

  it("ignores an ExtGState soft-mask dictionary and does not read into the next object", () => {
    const gsMask = "5 0 obj\n<< /Type /Mask /S /Luminosity /G 6 0 R >>\nendobj\n";
    const gs = "4 0 obj\n<< /Type /ExtGState /SMask 5 0 R >>\nendobj\n";
    // The RGB image right after the /Mask dict must not be mistaken for it.
    expect(hasInvalidSoftMask(pdf(gs + gsMask + mask(7, "/DeviceRGB")))).toBe(false);
  });

  it("does not confuse object 12 with object 112", () => {
    const body = image(1, 12) + mask(112, "/DeviceRGB", "/DCTDecode") + mask(12, "/DeviceGray");
    expect(hasInvalidSoftMask(pdf(body))).toBe(false);
  });

  it("scans across chunk boundaries", () => {
    const body = image(1, 2) + "%".repeat(37) + "\n" + mask(2, "/DeviceRGB", "/DCTDecode");
    for (const chunk of [7, 16, 31, 64]) {
      expect(hasInvalidSoftMask(pdf(body), chunk)).toBe(true);
    }
  });

  it("does not split a number at a chunk boundary", () => {
    const body = image(1, 12) + mask(112, "/DeviceRGB", "/DCTDecode") + mask(12, "/DeviceGray");
    for (const chunk of [3, 5, 8, 13]) {
      expect(hasInvalidSoftMask(pdf(body), chunk)).toBe(false);
    }
  });
});
