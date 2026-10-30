// CIEDE2000 colour difference between two RGBA pixel buffers (sRGB, D65),
// shared by the filter measurement (index.html) and the tuning lab (lab.html).

// sRGB (8-bit) to CIELAB (D65).
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
function lab(px, i) {
  const r = LINEAR[px[i]], g = LINEAR[px[i + 1]], b = LINEAR[px[i + 2]];
  const fx = labF((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = labF(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = labF((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const DEG = Math.PI / 180;
const P25 = 25 ** 7;
/** CIEDE2000 (Sharma, Wu and Dalal 2005), kL = kC = kH = 1. */
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + P25)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  let h1 = Math.atan2(b1, a1p); if (h1 < 0) h1 += 2 * Math.PI;
  let h2 = Math.atan2(b2, a2p); if (h2 < 0) h2 += 2 * Math.PI;
  const chroma = C1 * C2 !== 0;
  let dh = 0;
  if (chroma) {
    dh = h2 - h1;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    else if (dh < -Math.PI) dh += 2 * Math.PI;
  }
  const dL = L2 - L1, dC = C2 - C1, dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh / 2);
  const Lb = (L1 + L2) / 2, Cbp = (C1 + C2) / 2;
  let hb = h1 + h2;
  if (chroma) hb = Math.abs(h1 - h2) > Math.PI ? (hb < 2 * Math.PI ? hb + 2 * Math.PI : hb - 2 * Math.PI) / 2 : hb / 2;
  const T = 1 - 0.17 * Math.cos(hb - 30 * DEG) + 0.24 * Math.cos(2 * hb) + 0.32 * Math.cos(3 * hb + 6 * DEG) - 0.2 * Math.cos(4 * hb - 63 * DEG);
  const dTheta = 30 * DEG * Math.exp(-(((hb / DEG - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + P25));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

/** Mean and 95th percentile of ΔE2000 between two same-size RGBA buffers, every `stride`th pixel each way. */
export function colourDifference(before, after, width, height, stride = 2) {
  const BIN = 0.05;
  const bins = new Uint32Array(2001); // 0 to 100 in 0.05 steps, the last holds the rest
  let sum = 0, n = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const same = before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2];
      const de = same ? 0 : deltaE2000(lab(before, i), lab(after, i));
      sum += de;
      n++;
      bins[Math.min(bins.length - 1, Math.floor(de / BIN))]++;
    }
  }
  let seen = 0, p95 = 0;
  for (let b = 0; b < bins.length; b++) {
    seen += bins[b];
    if (seen >= 0.95 * n) { p95 = (b + 1) * BIN; break; }
  }
  return { mean: sum / n, p95 };
}
