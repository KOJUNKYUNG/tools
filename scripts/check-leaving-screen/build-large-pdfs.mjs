// Builds PDFs near the 50 MB upload limit for the freeze gate of pdf-lib's yields
// (#140), since no real file sits there. pdf-lib's cost follows objects, not
// bytes, so they span that: a real file cut to size (big streams, few objects),
// a real deck repeated (the most objects per MB of the real files), an ebook
// (many pages), and many small objects, the worst a parser can meet.
//
// Run: node --max-old-space-size=8192 scripts/check-leaving-screen/build-large-pdfs.mjs <a real PDF over 50 MB> <a real deck, repeated> [only this sample]
// (both in tests/fixtures)
// Writes to tests/large-pdf-samples/ (gitignored), which test:real does not read.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFName, ParseSpeeds, StandardFonts } from "pdf-lib";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const FIXTURES = process.env.REAL_FIXTURES_DIR ?? join(root, "tests/fixtures");
const OUT = join(root, "tests/large-pdf-samples");
const MB = 1024 * 1024;
/** Under the tools' 50 MB limit, and within 2 MB of it. */
const TARGET = { min: 48 * MB, max: 49.9 * MB };

/** A result of `build(count)` within TARGET, by bisecting `count`. */
async function fit(build, low, high) {
  while (low < high) {
    const count = Math.ceil((low + high) / 2);
    const bytes = await build(count);
    console.log(`  ${count}: ${(bytes.length / MB).toFixed(1)} MB`);
    if (bytes.length > TARGET.max) high = count - 1;
    else if (bytes.length < TARGET.min) low = count;
    else return { count, bytes };
  }
  throw new Error("No size within the target");
}

const loadFixture = async (name) => PDFDocument.load(await readFile(resolve(FIXTURES, name)), { parseSpeed: ParseSpeeds.Fastest });

async function realCut(fixture) {
  const source = await loadFixture(fixture);
  const build = async (count) => {
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(source, Array.from({ length: count }, (_, i) => i))) out.addPage(page);
    return out.save({ objectsPerTick: Infinity });
  };
  return fit(build, 1, source.getPageCount());
}

async function realRepeated(fixture) {
  const source = await loadFixture(fixture);
  const all = source.getPageIndices();
  const build = async (repeats) => {
    const out = await PDFDocument.create();
    for (let r = 0; r < repeats; r++) {
      for (const page of await out.copyPages(source, all)) out.addPage(page);
    }
    return out.save({ objectsPerTick: Infinity });
  };
  return fit(build, 1, 40);
}

const WORDS = "grace lamb river stone morning light mercy shepherd table bread harvest window garden silver mountain".split(" ");

async function ebook(count) {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.TimesRoman);
  // Seeded, so that a rebuilt sample measures the same.
  let seed = 1;
  const word = () => {
    seed = (seed * 48271) % 2147483647;
    return WORDS[seed % WORDS.length];
  };
  for (let p = 0; p < count; p++) {
    const page = out.addPage([595, 842]);
    for (let line = 0; line < 60; line++) {
      const text = Array.from({ length: 12 }, word).join(" ");
      page.drawText(text, { x: 40, y: 800 - line * 13, size: 10, font });
    }
  }
  return out.save({ objectsPerTick: Infinity });
}

/** Link annotations as plain objects: nothing a real file has so many of, the parser's worst case. */
async function smallObjects(count) {
  const out = await PDFDocument.create();
  const perPage = 500;
  for (let p = 0; p < count; p++) {
    const page = out.addPage([595, 842]);
    const refs = Array.from({ length: perPage }, (_, i) =>
      out.context.register(
        out.context.obj({ Type: "Annot", Subtype: "Link", Rect: [i, p, i + 10, p + 10], Border: [0, 0, 0] }),
      ),
    );
    page.node.set(PDFName.of("Annots"), out.context.obj(refs));
  }
  return out.save({ useObjectStreams: false, objectsPerTick: Infinity });
}

await mkdir(OUT, { recursive: true });
const [fixture, deck, only] = process.argv.slice(2);
if (!fixture || !deck) throw new Error("Pass a real PDF over 50 MB and a real deck, from tests/fixtures");

for (const [name, build] of [
  ["real-cut", () => realCut(fixture)],
  ["real-repeated", () => realRepeated(deck)],
  ["ebook", () => fit(ebook, 20_000, 22_000)],
  ["small-objects", () => fit(smallObjects, 600, 900)],
].filter(([name]) => !only || name === only)) {
  console.log(name);
  const { count, bytes } = await build();
  await writeFile(join(OUT, `${name}.pdf`), bytes);
  console.log(`${name}.pdf: ${(bytes.length / MB).toFixed(1)} MB, count ${count}`);
}
