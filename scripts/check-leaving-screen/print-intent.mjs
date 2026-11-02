// pdf-to-image's gate (#139): does pdf.js's print intent, which draws without
// waiting on frames, give the images the display intent gives, on the pages
// `pageIntent` (src/lib/pdf/pdfToImageIntent.ts) sends to print? It renders
// every page of the local PDFs (the fixtures, and tests/print-intent-samples,
// which test:real does not read), and of built samples with annotations, forms
// and layers, both ways as the tool's engine does,
// and compares pixels. The canvas stays in software unless --gpu. Even there the
// display way can differ from itself between two draws (a few pixels by a few
// levels: where its frames cut the drawing), so a page that differs is drawn
// again that way, and a difference is the intent's unless print matches a redraw
// or display alone differs by as much.
// It also reports each intent's longest main-thread task, since print does not
// yield between frames (measure that with --gpu, the tool's own canvas). A DIFF
// on a page that stays on display is why the rule exists; it passes when no
// page sent to print differs and every file could be read.

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { AnnotationFlags, degrees, PDFDocument, PDFName } from "pdf-lib";

const PRINT = AnnotationFlags.Print;
const NO_VIEW = AnnotationFlags.NoView;

function addAnnotation(doc, page, dict) {
  page.node.addAnnot(doc.context.register(doc.context.obj({ Type: "Annot", ...dict })));
}

/** A highlight and a square with no appearance of their own, and a stamp with one, all carrying `flags`. */
async function annotatedPage(flags) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  page.drawText("Annotated page", { x: 50, y: 340, size: 24 });
  addAnnotation(doc, page, {
    Subtype: "Highlight",
    Rect: [50, 330, 250, 370],
    QuadPoints: [50, 370, 250, 370, 50, 330, 250, 330],
    C: [1, 1, 0],
    F: flags,
  });
  addAnnotation(doc, page, { Subtype: "Square", Rect: [50, 200, 250, 300], C: [1, 0, 0], BS: { W: 4 }, F: flags });
  const appearance = doc.context.register(
    doc.context.stream("0 0 1 rg 0 0 200 100 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 200, 100] }),
  );
  addAnnotation(doc, page, { Subtype: "Stamp", Rect: [300, 200, 500, 300], AP: { N: appearance }, F: flags });
  return { doc, page };
}

const annotated = async (flags) => (await annotatedPage(flags)).doc.save();

/** Every other kind pdf.js draws an appearance for by itself, or from one of its own. */
async function annotationKinds(flags) {
  const { doc, page } = await annotatedPage(flags);
  const add = (dict) => addAnnotation(doc, page, { C: [0, 0.6, 0], F: flags, ...dict });
  add({ Subtype: "Underline", Rect: [50, 150, 200, 170], QuadPoints: [50, 170, 200, 170, 50, 150, 200, 150] });
  add({ Subtype: "StrikeOut", Rect: [220, 150, 370, 170], QuadPoints: [220, 170, 370, 170, 220, 150, 370, 150] });
  add({ Subtype: "Squiggly", Rect: [390, 150, 540, 170], QuadPoints: [390, 170, 540, 170, 390, 150, 540, 150] });
  add({ Subtype: "Line", Rect: [50, 90, 200, 130], L: [50, 90, 200, 130] });
  add({ Subtype: "Circle", Rect: [220, 90, 370, 130] });
  add({ Subtype: "Polygon", Rect: [390, 90, 540, 130], Vertices: [390, 90, 540, 90, 465, 130] });
  add({ Subtype: "PolyLine", Rect: [50, 30, 200, 70], Vertices: [50, 30, 125, 70, 200, 30] });
  add({ Subtype: "Ink", Rect: [220, 30, 370, 70], InkList: [[220, 30, 295, 70, 370, 30]] });
  add({ Subtype: "FreeText", Rect: [390, 30, 540, 70], Contents: "Free text", DA: "0 0 0 rg /Helv 12 Tf" });
  add({ Subtype: "Text", Rect: [560, 30, 580, 50], Contents: "A note" });
  return doc.save();
}

/** One page per mix of the flags that decide what shows, each page with annotations and fields that keep their own canvas on screen. */
async function flagSweep(rotation) {
  const swept = [AnnotationFlags.Invisible, AnnotationFlags.Hidden, PRINT, AnnotationFlags.NoRotate, NO_VIEW];
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  for (let bits = 0; bits < 1 << swept.length; bits++) {
    const flags = swept.reduce((mix, flag, i) => (bits & (1 << i) ? mix | flag : mix), 0);
    const page = doc.addPage([600, 400]);
    page.setRotation(degrees(rotation));
    page.drawText(`Flags ${flags}`, { x: 50, y: 360, size: 18 });
    const appearance = doc.context.register(
      doc.context.stream("0 0 1 rg 0 0 200 100 re f", { Type: "XObject", Subtype: "Form", BBox: [0, 0, 200, 100] }),
    );
    addAnnotation(doc, page, { Subtype: "Stamp", Rect: [300, 200, 500, 300], AP: { N: appearance }, F: flags });
    addAnnotation(doc, page, { Subtype: "Square", Rect: [50, 200, 250, 300], C: [1, 0, 0], BS: { W: 4 }, F: flags });
    const readOnly = form.createTextField(`read-only-${bits}`);
    readOnly.setText("Read only");
    readOnly.addToPage(page, { x: 50, y: 120, width: 200, height: 30 });
    readOnly.enableReadOnly();
    const button = form.createButton(`button-${bits}`);
    button.addToPage("Press", page, { x: 300, y: 120, width: 200, height: 30 });
    for (const field of [readOnly, button]) field.acroField.getWidgets()[0].setFlags(flags);
  }
  return doc.save();
}

/** Every kind of form field, filled in, printable or not. */
async function formSample(printable) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 500]);
  const form = doc.getForm();
  const at = (y) => ({ x: 50, y, width: 200, height: 30 });

  const text = form.createTextField("text");
  text.setText("Filled in");
  text.addToPage(page, at(440));
  const check = form.createCheckBox("check");
  check.addToPage(page, { x: 50, y: 390, width: 30, height: 30 });
  check.check();
  const radio = form.createRadioGroup("radio");
  radio.addOptionToPage("a", page, { x: 50, y: 340, width: 30, height: 30 });
  radio.addOptionToPage("b", page, { x: 100, y: 340, width: 30, height: 30 });
  radio.select("a");
  const dropdown = form.createDropdown("dropdown");
  dropdown.addOptions(["One", "Two"]);
  dropdown.select("Two");
  dropdown.addToPage(page, at(290));
  const list = form.createOptionList("list");
  list.addOptions(["One", "Two", "Three"]);
  list.select("Two");
  list.addToPage(page, { ...at(200), height: 70 });
  const button = form.createButton("button");
  button.addToPage("Press", page, at(150));

  if (!printable) {
    for (const field of form.getFields()) {
      for (const widget of field.acroField.getWidgets()) widget.setFlagTo(PRINT, false);
    }
  }
  return doc.save();
}

/** Layers a viewer shows but a printer does not, and the reverse. */
async function layers() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const { context } = doc;
  const printOff = context.register(
    context.obj({ Type: "OCG", Name: "screen only", Usage: { Print: { PrintState: "OFF" }, View: { ViewState: "ON" } } }),
  );
  const viewOff = context.register(
    context.obj({ Type: "OCG", Name: "print only", Usage: { Print: { PrintState: "ON" }, View: { ViewState: "OFF" } } }),
  );
  doc.catalog.set(
    PDFName.of("OCProperties"),
    context.obj({
      OCGs: [printOff, viewOff],
      D: {
        ON: [printOff, viewOff],
        AS: [
          { Event: "View", Category: ["View"], OCGs: [printOff, viewOff] },
          { Event: "Print", Category: ["Print"], OCGs: [printOff, viewOff] },
        ],
      },
    }),
  );
  page.node.normalizedEntries();
  const resources = page.node.Resources();
  resources.set(PDFName.of("Properties"), context.obj({ ScreenOnly: printOff, PrintOnly: viewOff }));
  page.node.addContentStream(
    context.register(
      context.stream(
        "/OC /ScreenOnly BDC 1 0 0 rg 50 200 200 100 re f EMC\n/OC /PrintOnly BDC 0 0 1 rg 300 200 200 100 re f EMC",
      ),
    ),
  );
  return doc.save();
}

/** The cases the local files may not hold, named by what a difference there would mean. */
async function builtSamples() {
  return [
    ["built: annotations with the print flag", await annotated(PRINT)],
    ["built: annotations without the print flag", await annotated(0)],
    ["built: annotations hidden on screen, printable", await annotated(PRINT | NO_VIEW)],
    ["built: form, printable", await formSample(true)],
    ["built: form, not printable", await formSample(false)],
    ["built: layers for screen only and print only", await layers()],
    ["built: other annotation kinds with the print flag", await annotationKinds(PRINT)],
    ["built: other annotation kinds without the print flag", await annotationKinds(0)],
    ["built: every mix of flags", await flagSweep(0)],
    ["built: every mix of flags, page turned 90°", await flagSweep(90)],
  ];
}

// Evaluated in the blank page. A canvas made as the tool's engine makes it
// (`pdfToImage.ts`) with --gpu, in software without.
const PAGE_HELPERS = `
  const REDRAWS = 30;
  window.__gate ??= {
    async load(path) {
      const pdfjs = await import("/lib/pdf.min.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/build/pdf.worker.min.mjs";
      return pdfjs.getDocument({
        url: path,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
        wasmUrl: "/pdfjs/wasm/",
        iccUrl: "/pdfjs/iccs/",
      }).promise;
    },
    async open(path) {
      this.path = path;
      this.doc = await this.load(path);
      this.layers = [...(await this.doc.getOptionalContentConfig())].length;
      return { pages: this.doc.numPages, layers: this.layers };
    },
    async draw(page, scale, intent, gpu) {
      const viewport = page.getViewport({ scale, rotation: page.rotate });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", gpu ? undefined : { willReadFrequently: true });
      const tasks = [];
      const observer = new PerformanceObserver((list) => tasks.push(...list.getEntries()));
      observer.observe({ type: "longtask" });
      await page.render({ canvas, viewport, intent }).promise;
      // A long task is reported once it has ended, so give it a moment.
      await new Promise((done) => setTimeout(done, 50));
      tasks.push(...observer.takeRecords());
      observer.disconnect();
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      canvas.width = canvas.height = 0;
      return { pixels, longestTask: Math.max(0, ...tasks.map((t) => t.duration)) };
    },
    differing(a, b) {
      let count = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) count++;
      }
      return count;
    },
    // The rule of pageIntent, here in the page: no layers, and the same annotations for both intents.
    async printSafe(page) {
      if (this.layers) return false;
      const ids = async (intent) => (await page.getAnnotations({ intent })).map((a) => a.id).sort().join();
      return (await ids("display")) === (await ids("print"));
    },
    async comparePage(n, scale, gpu) {
      const page = await this.doc.getPage(n);
      const annotations = await page.getAnnotations({ intent: "any" });
      const printSafe = await this.printSafe(page);
      const display = await this.draw(page, scale, "display", gpu);
      const print = await this.draw(page, scale, "print", gpu);
      const differing = this.differing(display.pixels, print.pixels);
      let explained = false;
      let displayVaries = 0;
      for (let i = 0; differing && !explained && i < REDRAWS; i++) {
        // A fresh document, as a run starts: a redraw in the same one repeats itself more.
        const fresh = await this.load(this.path);
        const again = (await this.draw(await fresh.getPage(n), scale, "display", gpu)).pixels;
        await fresh.destroy();
        displayVaries = Math.max(displayVaries, this.differing(display.pixels, again));
        explained = differing <= displayVaries || this.differing(print.pixels, again) === 0;
      }
      const total = display.pixels.length / 4;
      page.cleanup();
      return {
        annotations: annotations.map((a) => a.subtype),
        printSafe,
        total,
        differing,
        explained,
        displayTask: display.longestTask,
        printTask: print.longestTask,
      };
    },
    close() {
      return this.doc?.destroy();
    },
  };
`;

/** Runs the gate over `folders` and the built samples. True when every page sent to print matches. */
export async function checkPrintIntent({ evaluate, server }, folders, { dpi, gpu }) {
  await evaluate(PAGE_HELPERS);
  const scale = dpi / 72;
  const samples = [];
  for (const folder of folders) {
    if (!existsSync(folder)) continue;
    const names = (await readdir(folder, { recursive: true })).filter((n) => /\.pdf$/i.test(n)).sort();
    for (const name of names) samples.push([name, await readFile(join(folder, name))]);
  }
  samples.push(...(await builtSamples()));

  let unread = false;
  const worst = { display: 0, print: 0 };
  const rule = { print: 0, display: 0, wrong: [] };
  for (const [name, bytes] of samples) {
    const path = server.hold(bytes);
    try {
      const { pages, layers } = await evaluate(`__gate.open(${JSON.stringify(path)})`);
      const differs = [];
      const subtypes = new Set();
      let displayTask = 0;
      let printTask = 0;
      let toPrint = 0;
      let varies = 0;
      for (let n = 1; n <= pages; n++) {
        const page = await evaluate(`__gate.comparePage(${n}, ${scale}, ${Boolean(gpu)})`);
        rule[page.printSafe ? "print" : "display"]++;
        if (page.printSafe) toPrint++;
        if (page.printSafe && page.differing && !page.explained) rule.wrong.push(`${name} p${n}`);
        page.annotations.forEach((a) => subtypes.add(a));
        displayTask = Math.max(displayTask, page.displayTask);
        printTask = Math.max(printTask, page.printTask);
        if (page.explained) varies++;
        else if (page.differing) differs.push(`p${n}: ${page.differing}/${page.total} px`);
      }
      worst.display = Math.max(worst.display, displayTask);
      worst.print = Math.max(worst.print, printTask);
      const contents = [subtypes.size ? [...subtypes].join("+") : "no annotations", layers ? `${layers} layers` : "no layers"].join(", ");
      console.log(`${differs.length ? "DIFF" : "same"}  ${name} · ${pages} pages · ${contents} · ${toPrint}/${pages} to print${varies ? ` · display varies by itself on ${varies} pages` : ""} · longest task ${Math.round(displayTask)} → ${Math.round(printTask)} ms`);
      for (const line of differs.slice(0, 5)) console.log(`      ${line}`);
      if (differs.length > 5) console.log(`      ${differs.length - 5} more pages`);
    } catch (error) {
      // The tool cannot open a locked file either.
      if (error.message.includes("PasswordException")) {
        console.log(`skip  ${name}: locked`);
        continue;
      }
      unread = true;
      console.log(`FAIL  ${name}: ${error.message.split("\n")[0]}`);
    } finally {
      await evaluate("__gate.close()").catch(() => {});
      server.forget(path);
    }
  }
  console.log(`\nCanvas: ${gpu ? "GPU" : "software"}. Longest main-thread task at ${dpi} DPI: display ${Math.round(worst.display)} ms, print ${Math.round(worst.print)} ms`);
  console.log(`Per-page rule: ${rule.print} pages to print, ${rule.display} stay on display; ${rule.wrong.length} of those to print differ${rule.wrong.length ? `: ${rule.wrong.join(", ")}` : ""}`);
  return !unread && rule.wrong.length === 0;
}
