// Compares two runs' outputs by content, not by bytes (a PDF's save stamps a
// time): a PDF by its pages' pixels, a picture by its pixels, a zip or .pptx
// entry by entry. It serves the files to a blank page of its own and reads them
// there, so that pdf.js and the browser's decoders do the reading.

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

// Evaluated in the blank page. Pixels come back as a hash, so that pictures of
// any size stay small. `willReadFrequently` keeps the canvas in software, so
// that a difference is the file's and not the GPU's.
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

/** Each page's size and pixels; pages render one after another to bound memory. */
function pdfHashes(evaluate, path) {
  return evaluate(`(async () => {
    ${PAGE_HELPERS}
    const pdfjs = await import("/lib/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({
      url: ${JSON.stringify(path)},
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
      iccUrl: "/pdfjs/iccs/",
    }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1.5 });
      const { canvas, ctx } = newCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas, viewport }).promise;
      pages.push(await pixelHash(canvas, ctx));
      page.cleanup();
    }
    await doc.destroy();
    return pages;
  })()`);
}

/**
 * One file's bytes against another's, by the content its kind has. Resolves to
 * { same, what, diffs }: `what` says what was compared, `diffs` names what differs.
 */
async function compareContent(name, a, b, browser) {
  if (Buffer.compare(a, b) === 0) return { same: true, what: "same bytes", diffs: [] };
  if (ZIP.test(name)) return compareZips(a, b, browser);
  if (!/\.pdf$/i.test(name) && !PICTURE.test(name)) return { same: false, what: "bytes", diffs: ["bytes"] };
  const pathA = browser.server.hold(a);
  const pathB = browser.server.hold(b);
  try {
    if (PICTURE.test(name)) {
      const hashA = await pictureHash(browser.evaluate, pathA);
      const hashB = await pictureHash(browser.evaluate, pathB);
      return { same: hashA === hashB, what: "pixels", diffs: hashA === hashB ? [] : ["pixels"] };
    }
    const pagesA = await pdfHashes(browser.evaluate, pathA);
    const pagesB = await pdfHashes(browser.evaluate, pathB);
    if (pagesA.length !== pagesB.length) {
      return { same: false, what: "pages", diffs: [`${pagesA.length} pages against ${pagesB.length}`] };
    }
    const pages = pagesA.flatMap((hash, i) => (hash === pagesB[i] ? [] : [`page ${i + 1}`]));
    return { same: pages.length === 0, what: `${pagesA.length} pages' pixels`, diffs: pages };
  } finally {
    browser.server.forget(pathA);
    browser.server.forget(pathB);
  }
}

async function compareZips(a, b, browser) {
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
    const entry = await compareContent(name, entryA, entryB, browser);
    if (!entry.same) diffs.push(`${name}: ${entry.diffs.join(", ")}`);
  }
  return { same: diffs.length === 0, what: `${names.length} entries`, diffs };
}

/** Two files, with the name that says their kind. */
export async function compareFiles(name, pathA, pathB, browser) {
  return compareContent(name, await readFile(pathA), await readFile(pathB), browser);
}

/**
 * What two runs saved, paired by file name. Resolves to one comparison per
 * file: { name, same, what, diffs }.
 */
export async function compareFolders(dirA, dirB, browser) {
  const namesA = await readdir(dirA);
  const namesB = await readdir(dirB);
  const results = [];
  for (const name of new Set([...namesA, ...namesB])) {
    if (namesA.includes(name) && namesB.includes(name)) {
      results.push({ name, ...(await compareFiles(name, join(dirA, name), join(dirB, name), browser)) });
    } else {
      results.push({ name, same: false, what: "saved files", diffs: ["saved by only one run"] });
    }
  }
  return results;
}
