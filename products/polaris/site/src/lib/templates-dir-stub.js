// Build-time stub for `@bionova/polaris-handlers`'s `templates-dir.js`.
//
// The real module evaluates `new URL("../templates/", import.meta.url)`, which
// webpack tries to resolve as a bundled module and fails on (the templates dir
// is a runtime asset, not an importable module). The React web surface renders
// with JSX and never reads `TEMPLATES_DIR` — the Mustache templates are for
// non-React surfaces — so we alias the module to this inert export for the
// `next build` bundle. See next.config.mjs `webpack.resolve.alias`.
export const TEMPLATES_DIR = "";
