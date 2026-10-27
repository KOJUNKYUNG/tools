// Draws one Paper shader from React-style props, in the browser, for the lab
// (lab.html) and the headless renderer (shader-page.html). The drawing itself
// is paper-draw.js, shared with the app's recipe edit. The package is served at
// /shaders/ and the data at /paper-props.json by the script that serves the page.

import * as paper from "/shaders/index.js";
import { STILL, paperDrawing } from "/paper-draw.js";

export { STILL };

let catalog;
let drawing;
export async function loadCatalog() {
  catalog ??= await (await fetch("/paper-props.json")).json();
  drawing ??= paperDrawing(paper, catalog);
  return catalog;
}

/** The shader's key in paper-props.json, from either its key or its React component name. */
export function shaderKey(nameOrComponent) {
  return drawing.shaderKey(nameOrComponent);
}

/** A spec's props on top of the shader's default preset, as Paper's components do. */
export function withDefaults(key, props) {
  return drawing.withDefaults(key, props);
}

/**
 * Mount `spec` ({ shader, frame, ...props }) into `el` at the still's size and
 * return the ShaderMount. `speed` 0 draws the frame once; another speed plays.
 */
export async function mountStill(el, spec, options) {
  await loadCatalog();
  return drawing.mountStill(el, spec, options);
}

/** Change the props of a mounted still without remounting it. */
export function updateStill(mount, spec) {
  drawing.updateStill(mount, spec);
}

/**
 * Draw `spec` once and return it as a PNG data URL: 2560 × 1440 at the
 * default pixel ratio, larger at a higher one with the same composition.
 */
export async function renderStillPng(el, spec, pixelRatio = STILL.pixelRatio) {
  await loadCatalog();
  return drawing.drawStill(el, spec, pixelRatio, (canvas) => canvas.toDataURL("image/png"));
}
