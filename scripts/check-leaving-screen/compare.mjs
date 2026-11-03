// Compares two runs' outputs by content, not by bytes (a PDF's save stamps a
// time): a PDF by its pages' pixels, within what two draws of one file differ by,
// a picture by its pixels, a zip or .pptx entry by entry. It serves the files to
// a blank page of its own and reads them there, so that pdf.js and the browser's
// decoders do the reading.

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

const PICTURE = /\.(png|jpe?g|webp)$/i;
const ZIP = /\.(zip|pptx)$/i;
/** A deck's properties carry their save time, which the user never sees. */
const IGNORED_ENTRY = /^docProps\/core\.xml$/;

const TYPES = { ".mjs": "text/javascript", ".wasm": "application/wasm" };

/** Serves a blank page, pdf.js, and the bytes under comparison. */
export async function startCompareServer() {
  const pdfjsAssets = join(root, "public/pdfjs");
  const blobs = new Map();
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path === "/") {
        res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>compare</title>");
      } else if (path === "/lib/pdf.min.mjs") {
        const bytes = await readFile(join(root, "node_modules/pdfjs-dist/build/pdf.min.mjs"));
        res.writeHead(200, { "content-type": "text/javascript" }).end(bytes);
      } else if (path.startsWith("/pdfjs/")) {
        const file = resolve(pdfjsAssets, path.slice("/pdfjs/".length));
        const inside = relative(pdfjsAssets, file);
        if (inside.startsWith("..") || isAbsolute(inside)) return void res.writeHead(404).end();
        const bytes = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(bytes);
      } else if (blobs.has(path)) {
        res.writeHead(200, { "content-type": "application/octet-stream" }).end(blobs.get(path));
      } else {
        res.writeHead(404).end();
      }
    } catch (error) {
      res.writeHead(500).end(String(error));
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  let id = 0;
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    /** Bytes at a URL path of their own, until `forget`. */
    hold(bytes) {
      const path = `/blob/${++id}`;
      blobs.set(path, bytes);
      return path;
    },
    forget: (path) => blobs.delete(path),
    close: () => new Promise((done) => server.close(done)),
  };
}

/** How far a value may differ, of 255, between two draws of one PDF page. */
const PIXEL_TOLERANCE = 8;
/** The share of a page's values that may differ at all between two draws. */
const NOISE_SHARE = 0.0001;

// Evaluated in the blank page. A picture's pixels come back as a hash, so that
// pictures of any size stay small. `willReadFrequently` keeps the canvas in
// software, so that a difference is the file's and not the GPU's.
const PAGE_HELPERS = `
  async function pixelHash(canvas, ctx) {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return canvas.width + "x" + canvas.height + ":" + hex;
  }
  function newCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) };
  }
`;

function pictureHash(evaluate, path) {
  return evaluate(`(async () => {
    ${PAGE_HELPERS}
    const bitmap = await createImageBitmap(await (await fetch(${JSON.stringify(path)})).blob());
    const { canvas, ctx } = newCanvas(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return pixelHash(canvas, ctx);
  })()`);
}

/**
 * Two PDFs' page counts and the pages that differ; pages render one pair after
 * another to bound memory. Two draws of one file differ by a few levels on a few
 * pixels (up to 7 of 255 on 0.004% of values measured, #139), so that is not a
 * difference. A faint watermark moves as few levels but far more values (#140).
 */
function pdfDifferences(evaluate, pathA, pathB) {
  return evaluate(`(async () => {
    ${PAGE_HELPERS}
    const pdfjs = await import("/lib/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.min.mjs";
    const open = (url) => pdfjs.getDocument({
      url,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
      iccUrl: "/pdfjs/iccs/",
    }).promise;
    const pixels = async (doc, n) => {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.5 });
      const { canvas, ctx } = newCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    const docA = await open(${JSON.stringify(pathA)});
    const docB = await open(${JSON.stringify(pathB)});
    const differing = [];
    if (docA.numPages === docB.numPages) {
      for (let n = 1; n <= docA.numPages; n++) {
        const a = await pixels(docA, n);
        const b = await pixels(docB, n);
        const sameSize = a.width === b.width && a.height === b.height;
        let changed = 0;
        let beyondNoise = false;
        for (let i = 0; sameSize && i < a.data.length; i++) {
          const distance = Math.abs(a.data[i] - b.data[i]);
          if (distance > 0) changed++;
          if (distance > ${PIXEL_TOLERANCE}) beyondNoise = true;
        }
        if (!sameSize || beyondNoise || changed > a.data.length * ${NOISE_SHARE}) differing.push(n);
      }
    }
    const pagesA = docA.numPages;
    const pagesB = docB.numPages;
    await docA.destroy();
    await docB.destroy();
    return { pagesA, pagesB, differing };
  })()`);
}

/**
 * One file's bytes against another's, by the content its kind has. Resolves to
 * { same, what, diffs }: `what` says what was compared, `diffs` names what differs.
 */
async function compareContent(name, a, b, reader) {
  if (Buffer.compare(a, b) === 0) return { same: true, what: "same bytes", diffs: [] };
  if (ZIP.test(name)) return compareZips(a, b, reader);
  if (!/\.pdf$/i.test(name) && !PICTURE.test(name)) return { same: false, what: "bytes", diffs: ["bytes"] };
  const pathA = reader.server.hold(a);
  const pathB = reader.server.hold(b);
  try {
    if (PICTURE.test(name)) {
      const hashA = await pictureHash(reader.evaluate, pathA);
      const hashB = await pictureHash(reader.evaluate, pathB);
      return { same: hashA === hashB, what: "pixels", diffs: hashA === hashB ? [] : ["pixels"] };
    }
    const { pagesA, pagesB, differing } = await pdfDifferences(reader.evaluate, pathA, pathB);
    if (pagesA !== pagesB) {
      return { same: false, what: "pages", diffs: [`${pagesA} pages against ${pagesB}`] };
    }
    return { same: differing.length === 0, what: `${pagesA} pages' pixels`, diffs: differing.map((n) => `page ${n}`) };
  } finally {
    reader.server.forget(pathA);
    reader.server.forget(pathB);
  }
}

async function compareZips(a, b, reader) {
  const zipA = await JSZip.loadAsync(a);
  const zipB = await JSZip.loadAsync(b);
  const fileNames = (zip) => Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const names = fileNames(zipA);
  const onlyInOne = [...names.filter((n) => !zipB.files[n]), ...fileNames(zipB).filter((n) => !zipA.files[n])];
  if (onlyInOne.length) return { same: false, what: "entries", diffs: onlyInOne.map((n) => `only in one: ${n}`) };
  const diffs = [];
  for (const name of names) {
    if (IGNORED_ENTRY.test(name)) continue;
    const entryA = await zipA.files[name].async("nodebuffer");
    const entryB = await zipB.files[name].async("nodebuffer");
    const entry = await compareContent(name, entryA, entryB, reader);
    if (!entry.same) diffs.push(`${name}: ${entry.diffs.join(", ")}`);
  }
  return { same: diffs.length === 0, what: `${names.length} entries`, diffs };
}

/** Two files, with the name that says their kind. `reader` is the blank page ({ evaluate }) and its server. */
export async function compareFiles(name, pathA, pathB, reader) {
  return compareContent(name, await readFile(pathA), await readFile(pathB), reader);
}

// A fresh Chrome profile updates its components, and the check's download folder
// catches that too: `downloads.htm` holding a Chrome extension (a Cr24 header).
const isRunOutput = (name) => !name.startsWith("downloads.htm");

/**
 * What two runs saved, paired by file name. Resolves to one comparison per
 * file: { name, same, what, diffs }.
 */
export async function compareFolders(dirA, dirB, reader) {
  const namesA = (await readdir(dirA)).filter(isRunOutput);
  const namesB = (await readdir(dirB)).filter(isRunOutput);
  const results = [];
  for (const name of new Set([...namesA, ...namesB])) {
    if (namesA.includes(name) && namesB.includes(name)) {
      results.push({ name, ...(await compareFiles(name, join(dirA, name), join(dirB, name), reader)) });
    } else {
      results.push({ name, same: false, what: "saved files", diffs: ["saved by only one run"] });
    }
  }
  return results;
}
