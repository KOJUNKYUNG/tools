// Draws Paper shaders from React-style props: the one drawing code shared by
// the gallery scripts (paper-still.js, for the lab and the headless renderer),
// the app's recipe edit (src/lib/gallery/drawRecipe.ts) and its Paper image
// filters (src/lib/image/paperFilterDrawing.ts), so a recipe looks the same in
// the gallery file and in an edit. Props mean what they mean on
// shaders.paper.design: each one becomes a uniform the way
// @paper-design/shaders-react does it, from paper-props.json (see
// extract-paper-props.mjs). It imports nothing: the caller hands it the
// @paper-design/shaders module and the parsed paper-props.json.

/**
 * The composition every gallery gradient is drawn at: 1280 × 720 CSS px. The lab
 * previews it at 2×; gallery originals render it at 3× (3840 × 2160).
 */
export const STILL = { cssWidth: 1280, cssHeight: 720, pixelRatio: 2 };

/** The still's CSS box, the box a drawing is laid out at unless given another (a filter's). */
const STILL_BOX = { cssWidth: STILL.cssWidth, cssHeight: STILL.cssHeight };

const nextFrames = (n) =>
  new Promise((resolve) => {
    const step = () => (n-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

/** Drawing helpers bound to the `paper` module and the `catalog` (paper-props.json). */
export function paperDrawing(paper, catalog) {
  /** The shader's key in paper-props.json, from either its key or its React component name. */
  function shaderKey(nameOrComponent) {
    if (catalog.shaders[nameOrComponent]) return nameOrComponent;
    const hit = Object.entries(catalog.shaders).find(([, d]) => d.component === nameOrComponent);
    if (!hit) throw new Error(`unknown shader ${nameOrComponent}`);
    return hit[0];
  }

  /** A spec's props on top of the shader's default preset, as Paper's components do. */
  function withDefaults(key, props) {
    const def = catalog.shaders[key];
    return { ...def.presets[0].params, ...props };
  }

  /** The params of the shader's preset named `presetName`, as Paper's prop table lists them. */
  function presetParams(nameOrComponent, presetName) {
    const preset = catalog.shaders[shaderKey(nameOrComponent)].presets.find((p) => p.name === presetName);
    if (!preset) throw new Error(`${nameOrComponent}: unknown preset ${presetName}`);
    return preset.params;
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
      } else if (p.kind === "image") {
        // A loaded HTMLImageElement: Paper uploads it as a texture.
        uniforms[p.uniform] = value;
        if (p.flag) uniforms[p.flag] = true;
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
   * Mount `spec` ({ shader, frame, ...props }) into `el` at `box`'s CSS size
   * (the still's unless given) and return the ShaderMount. `speed` 0 draws the
   * frame once; another speed plays.
   */
  async function mountStill(el, spec, { speed = 0, preserveDrawingBuffer = false, pixelRatio = STILL.pixelRatio, box = STILL_BOX } = {}) {
    const { shader, frame = 0, name: _name, speed: _speed, ...props } = spec;
    const key = shaderKey(shader);
    const def = catalog.shaders[key];
    const uniforms = toUniforms(key, withDefaults(key, props));
    if (def.noiseTexture) {
      const noise = paper.getShaderNoiseTexture();
      await noise.decode();
      uniforms.u_noiseTexture = noise;
    }
    el.style.width = `${box.cssWidth}px`;
    el.style.height = `${box.cssHeight}px`;
    const max = box.cssWidth * box.cssHeight * pixelRatio ** 2;
    const mipmaps = def.mipmaps ?? [];
    return new paper.ShaderMount(el, paper[def.fragment], uniforms, { preserveDrawingBuffer }, speed, frame, pixelRatio, max, mipmaps);
  }

  /**
   * Change the props of a mounted still without remounting it; it draws again
   * at once. Both setters draw, so the frame is set only when it moves.
   */
  function updateStill(mount, spec) {
    const { shader, frame, name: _name, speed: _speed, ...props } = spec;
    const key = shaderKey(shader);
    mount.setUniforms(toUniforms(key, withDefaults(key, props)));
    if (frame !== undefined && frame !== mount.getCurrentFrame()) mount.setFrame(frame);
  }

  /**
   * Wait until a still mounted with `preserveDrawingBuffer` has its canvas at
   * `pixelRatio` of `box` (the size settles on the first resize callback) and
   * is drawn. A ratio that is not whole lands within a pixel, as Paper rounds.
   */
  async function settled(mount, pixelRatio, box = STILL_BOX) {
    const width = box.cssWidth * pixelRatio;
    const height = box.cssHeight * pixelRatio;
    const near = (a, b) => Math.abs(a - b) <= 1;
    for (let i = 0; i < 100 && !near(mount.canvasElement.width, width); i++) await nextFrames(1);
    if (!near(mount.canvasElement.width, width) || !near(mount.canvasElement.height, height)) {
      throw new Error(`canvas is ${mount.canvasElement.width} × ${mount.canvasElement.height}, not ${width} × ${height}`);
    }
    await nextFrames(2);
  }

  /**
   * Draw `spec` once at `pixelRatio` of `box` (same composition at any ratio)
   * and hand its canvas to `read`, e.g. to take a PNG; resolves to what `read`
   * returns.
   */
  async function drawStill(el, spec, pixelRatio, read, box = STILL_BOX) {
    const mount = await mountStill(el, spec, { preserveDrawingBuffer: true, pixelRatio, box });
    try {
      await settled(mount, pixelRatio, box);
      return await read(mount.canvasElement);
    } finally {
      mount.dispose();
      el.replaceChildren();
    }
  }

  return { shaderKey, withDefaults, presetParams, mountStill, updateStill, settled, drawStill };
}
