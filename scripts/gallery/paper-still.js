// Draws one Paper shader from React-style props, in the browser. Shared by the
// lab (lab.html) and the headless renderer (shader-page.html), so a spec looks
// the same in both. Props mean what they mean on shaders.paper.design: each
// one becomes a uniform the way @paper-design/shaders-react does it, from
// paper-props.json (see extract-paper-props.mjs). The package is served at
// /shaders/ and the data at /paper-props.json by the script that serves the page.

import * as paper from "/shaders/index.js";

/** The still every gallery gradient is drawn at: 1280 × 720 CSS px at 2× = 2560 × 1440. */
export const STILL = { cssWidth: 1280, cssHeight: 720, pixelRatio: 2 };

let catalog;
export async function loadCatalog() {
  catalog ??= await (await fetch("/paper-props.json")).json();
  return catalog;
}

/** The shader's key in paper-props.json, from either its key or its React component name. */
export function shaderKey(nameOrComponent) {
  if (catalog.shaders[nameOrComponent]) return nameOrComponent;
  const hit = Object.entries(catalog.shaders).find(([, d]) => d.component === nameOrComponent);
  if (!hit) throw new Error(`unknown shader ${nameOrComponent}`);
  return hit[0];
}

/** A spec's props on top of the shader's default preset, as Paper's components do. */
export function withDefaults(key, props) {
  const def = catalog.shaders[key];
  return { ...def.presets[0].params, ...props };
}

function toUniforms(key, params) {
  const def = catalog.shaders[key];
  const uniforms = {};
  for (const [prop, p] of Object.entries(def.props)) {
    const value = params[prop];
    if (value === undefined) continue;
    if (p.kind === "colors") {
      uniforms[p.uniform] = value.map((c) => paper.getShaderColorFromString(c));
      uniforms.u_colorsCount = value.length;
    } else if (p.kind === "color") {
      uniforms[p.uniform] = paper.getShaderColorFromString(value);
    } else if (p.kind === "enum") {
      const mapped = paper[p.enum][value];
      if (mapped === undefined) throw new Error(`${prop}: unknown option ${value}`);
      uniforms[p.uniform] = mapped;
    } else {
      uniforms[p.uniform] = value;
    }
  }
  return uniforms;
}

/**
 * Mount `spec` ({ shader, frame, ...props }) into `el` at the still's size and
 * return the ShaderMount. `speed` 0 draws the frame once; another speed plays.
 */
export async function mountStill(el, spec, { speed = 0, preserveDrawingBuffer = false } = {}) {
  await loadCatalog();
  const { shader, frame = 0, name: _name, speed: _speed, ...props } = spec;
  const key = shaderKey(shader);
  const def = catalog.shaders[key];
  const uniforms = toUniforms(key, withDefaults(key, props));
  if (def.noiseTexture) {
    const noise = paper.getShaderNoiseTexture();
    await noise.decode();
    uniforms.u_noiseTexture = noise;
  }
  el.style.width = `${STILL.cssWidth}px`;
  el.style.height = `${STILL.cssHeight}px`;
  const max = STILL.cssWidth * STILL.cssHeight * STILL.pixelRatio ** 2;
  return new paper.ShaderMount(el, paper[def.fragment], uniforms, { preserveDrawingBuffer }, speed, frame, STILL.pixelRatio, max);
}

/** Change the props of a mounted still without remounting it. */
export function updateStill(mount, spec) {
  const { shader, frame, name: _name, speed: _speed, ...props } = spec;
  const key = shaderKey(shader);
  mount.setUniforms(toUniforms(key, withDefaults(key, props)));
  if (frame !== undefined) mount.setFrame(frame);
}

const nextFrames = (n) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

/** Draw `spec` once and return it as a PNG data URL at 2560 × 1440. */
export async function renderStillPng(el, spec) {
  const mount = await mountStill(el, spec, { preserveDrawingBuffer: true });
  const width = STILL.cssWidth * STILL.pixelRatio;
  const height = STILL.cssHeight * STILL.pixelRatio;
  try {
    for (let i = 0; i < 100 && mount.canvasElement.width !== width; i++) await nextFrames(1);
    if (mount.canvasElement.width !== width || mount.canvasElement.height !== height) {
      throw new Error(`canvas is ${mount.canvasElement.width} × ${mount.canvasElement.height}, not ${width} × ${height}`);
    }
    await nextFrames(2);
    return mount.canvasElement.toDataURL("image/png");
  } finally {
    mount.dispose();
    el.replaceChildren();
  }
}
