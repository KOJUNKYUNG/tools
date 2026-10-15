import { crc32, deflateRawSync } from "node:zlib";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { describe, expect, it } from "vitest";
import { indexZip, openZip, storedIdentically } from "./zipReader";

interface RawEntry {
  name: string | Uint8Array;
  data: Uint8Array;
  /** 0 = STORE, 8 = DEFLATE (data is then the compressed stream). */
  method?: number;
  flags?: number;
  /** Defaults to data.length for STORE; set it for DEFLATE. */
  uncompressedSize?: number;
  extra?: Uint8Array;
  externalAttrs?: number;
}

/**
 * A minimal zip writer with full control over each header field, for the
 * edge cases JSZip's writer never produces. CRCs are left 0: JSZip does not
 * check them on load.
 */
function buildZip(entries: RawEntry[], prefix = new Uint8Array(0)): Uint8Array {
  const chunks: Uint8Array[] = [prefix];
  const central: Uint8Array[] = [];
  let offset = prefix.length;
  const header = (size: number, fill: (v: DataView) => void) => {
    const b = new Uint8Array(size);
    fill(new DataView(b.buffer));
    return b;
  };
  for (const e of entries) {
    const name = typeof e.name === "string" ? new TextEncoder().encode(e.name) : e.name;
    const extra = e.extra ?? new Uint8Array(0);
    const method = e.method ?? 0;
    const usize = e.uncompressedSize ?? e.data.length;
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true);
      v.setUint16(6, e.flags ?? 0, true);
      v.setUint16(8, method, true);
      v.setUint32(18, e.data.length, true);
      v.setUint32(22, usize, true);
      v.setUint16(26, name.length, true);
    });
    const cen = header(46, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(8, e.flags ?? 0, true);
      v.setUint16(10, method, true);
      v.setUint32(20, e.data.length, true);
      v.setUint32(24, usize, true);
      v.setUint16(28, name.length, true);
      v.setUint16(30, extra.length, true);
      v.setUint32(38, e.externalAttrs ?? 0, true);
      v.setUint32(42, offset - prefix.length, true);
    });
    chunks.push(local, name, e.data);
    central.push(cen, name, extra);
    offset += local.length + name.length + e.data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entries.length, true);
    v.setUint16(10, entries.length, true);
    v.setUint32(12, dirSize, true);
    v.setUint32(16, offset - prefix.length, true);
  });
  const all = [...chunks, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** A Unicode Path extra field (0x7075) that renames `name` to `path`. */
function unicodePath(name: string, path: string): Uint8Array {
  const value = utf8(path);
  const field = new Uint8Array(9 + value.length);
  const v = new DataView(field.buffer);
  v.setUint16(0, 0x7075, true);
  v.setUint16(2, 5 + value.length, true);
  v.setUint8(4, 1);
  v.setUint32(5, crc32(utf8(name)), true);
  field.set(value, 9);
  return field;
}
const XML = '<?xml version="1.0"?><a><b c="1"/>텍스트</a>';

/** What JSZip itself reads from the archive: names, and each part's bytes and text. */
async function viaJsZip(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name);
  return {
    names,
    bytes: await Promise.all(names.map((n) => zip.file(n)!.async("uint8array").catch(() => null))),
    text: await Promise.all(names.map((n) => zip.file(n)!.async("text").catch(() => null))),
  };
}

async function viaReader(bytes: Uint8Array) {
  const zip = await openZip(bytes);
  if (!zip) return null;
  return {
    names: zip.names,
    bytes: await Promise.all(zip.names.map((n) => zip.bytes(n))),
    text: await Promise.all(zip.names.map((n) => zip.text(n))),
  };
}

async function expectSameAsJsZip(bytes: Uint8Array): Promise<void> {
  expect(await viaReader(bytes)).toEqual(await viaJsZip(bytes));
}

describe("openZip reads as JSZip does, on the fast path", () => {
  it("a deck written by PptxGenJS", async () => {
    const pptx = new PptxGenJS();
    pptx.addSlide().addText("Slide", { x: 1, y: 1, w: 4, h: 1 });
    // write() returns a union over every outputType; "uint8array" yields this one.
    const deck = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    expect(indexZip(deck)).not.toBeNull();
    await expectSameAsJsZip(deck);
  });

  it("stored and deflated parts, folders, and a part read back after a JSZip rewrite", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", XML);
    zip.file("ppt/slides/slide1.xml", XML, { compression: "DEFLATE" });
    zip.file("ppt/media/image1.png", new Uint8Array([137, 80, 78, 71, 0, 255]));
    zip.folder("ppt/empty");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(indexZip(bytes)).not.toBeNull();
    await expectSameAsJsZip(bytes);
  });

  it("an empty part, whatever its compressed data says", async () => {
    const bytes = buildZip([
      { name: "a.xml", data: utf8("garbage"), method: 8, uncompressedSize: 0 },
    ]);
    expect(indexZip(bytes)).not.toBeNull();
    await expectSameAsJsZip(bytes);
  });

  it("a zip64 extra field on an entry that does not need it", async () => {
    const extra = new Uint8Array([0x01, 0x00, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    const bytes = buildZip([{ name: "a.xml", data: utf8(XML), extra }]);
    expect(indexZip(bytes)).not.toBeNull();
    await expectSameAsJsZip(bytes);
  });

  it("a byte-order mark at the start of a part is kept", async () => {
    const bytes = buildZip([{ name: "a.xml", data: utf8(`﻿${XML}`) }]);
    await expectSameAsJsZip(bytes);
  });
});

describe("openZip falls back to JSZip and still reads as it does", () => {
  it("a deflate stream the platform rejects (corrupt): unreadable, as in JSZip", async () => {
    const bytes = buildZip([
      { name: "a.xml", data: new Uint8Array([0xff, 0xff, 0xff, 0xff]), method: 8, uncompressedSize: 9 },
    ]);
    await expectSameAsJsZip(bytes);
    expect(await (await openZip(bytes))!.text("a.xml")).toBeNull();
  });

  it("a truncated deflate stream, which JSZip reads leniently", async () => {
    const full = deflateRawSync(Buffer.from(XML.repeat(50)));
    const bytes = buildZip([
      { name: "a.xml", data: full.subarray(0, full.length - 8), method: 8, uncompressedSize: 9999 },
    ]);
    await expectSameAsJsZip(bytes);
  });

  it("invalid UTF-8 in a part, which JSZip decodes with replacement", async () => {
    const bytes = buildZip([{ name: "a.xml", data: new Uint8Array([0x3c, 0x61, 0xc3, 0x28, 0x3e]) }]);
    await expectSameAsJsZip(bytes);
  });

  const deferred: [string, Uint8Array][] = [
    ["bytes prepended to the archive", buildZip([{ name: "a.xml", data: utf8(XML) }], utf8("PREFIX"))],
    ["a name JSZip normalises", buildZip([{ name: "ppt/./slides//a.xml", data: utf8(XML) }])],
    ["a repeated name", buildZip([{ name: "a.xml", data: utf8("1") }, { name: "a.xml", data: utf8("2") }])],
    ["a name that is not UTF-8", buildZip([{ name: new Uint8Array([0x61, 0xff, 0x2e, 0x78]), data: utf8(XML) }])],
    ["a Unicode Path extra field", buildZip([{ name: "a.xml", data: utf8(XML), extra: unicodePath("a.xml", "b.xml") }])],
  ];
  for (const [label, bytes] of deferred) {
    it(label, async () => {
      expect(indexZip(bytes)).toBeNull();
      await expectSameAsJsZip(bytes);
    });
  }
});

describe("openZip rejects what JSZip rejects", () => {
  it.each([
    ["not a zip at all", utf8("hello, not a zip")],
    ["an encrypted entry", buildZip([{ name: "a.xml", data: utf8(XML), flags: 0x0001 }])],
    ["an unknown compression method", buildZip([{ name: "a.xml", data: utf8(XML), method: 14 }])],
    ["a truncated archive", buildZip([{ name: "a.xml", data: utf8(XML) }]).subarray(0, 40)],
  ])("%s", async (_, bytes) => {
    expect(indexZip(bytes)).toBeNull();
    await expect(JSZip.loadAsync(bytes)).rejects.toThrow();
    expect(await openZip(bytes)).toBeNull();
  });
});

describe("storedIdentically", () => {
  async function pair() {
    const zip = new JSZip();
    zip.file("same.xml", XML);
    zip.file("edited.xml", XML);
    const a = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const copy = await JSZip.loadAsync(a);
    copy.file("edited.xml", XML.replace("1", "2"));
    const b = await copy.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return [(await openZip(a))!, (await openZip(b))!, b] as const;
  }

  it("is true for a part whose compressed bytes were copied, false for an edited one", async () => {
    const [a, b] = await pair();
    expect(storedIdentically(a, b, "same.xml")).toBe(true);
    expect(storedIdentically(a, b, "edited.xml")).toBe(false);
    expect(storedIdentically(a, b, "missing.xml")).toBe(false);
  });

  it("is false for the same text stored another way", async () => {
    const [a, , b] = await pair();
    const stored = await JSZip.loadAsync(b).then((zip) => zip.generateAsync({ type: "uint8array" }));
    expect(storedIdentically(a, (await openZip(stored))!, "same.xml")).toBe(false);
  });

  it("is false when either archive is read by JSZip", async () => {
    const [a] = await pair();
    const prefixed = buildZip([{ name: "same.xml", data: utf8(XML) }], utf8("PREFIX"));
    expect(storedIdentically(a, (await openZip(prefixed))!, "same.xml")).toBe(false);
  });
});
