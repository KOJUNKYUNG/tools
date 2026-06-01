// Intentionally empty. Used as a Turbopack `resolveAlias` browser-condition
// target so that Node-only built-ins (`fs`, `path`, `crypto`) referenced inside
// the qpdf-wasm Emscripten glue's node branch resolve to nothing in the browser
// bundle instead of erroring with "Module not found: Can't resolve 'fs'".
//
// The qpdf-wasm glue guards these requires behind a runtime `if (isNode)` check,
// so they never execute in the browser — this alias only silences the bundler's
// static resolution. See next.config.ts and src/lib/pdf/qpdf.ts.
export {};
