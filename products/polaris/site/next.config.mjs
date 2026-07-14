import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Resolve the real handler `templates-dir.js` so we can alias it for the
// bundler. That module evaluates `new URL("../templates/", import.meta.url)`,
// a runtime asset reference webpack cannot resolve as a module. The React web
// surface renders with JSX and never reads `TEMPLATES_DIR`, so we swap it for
// an inert stub at build time.
const handlersTemplatesDir = require.resolve(
  "@bionova/polaris-handlers/templates",
);
const templatesStub = fileURLToPath(
  new URL("./src/lib/templates-dir-stub.js", import.meta.url),
);

// Trace from the monorepo root so the standalone output nests the server under
// products/polaris/site/ (with node_modules at the bundle root). The Dockerfile
// runner copies and runs it from that path. Without this, Next infers the app
// dir as the root and emits a flat server.js the Dockerfile can't find.
const outputFileTracingRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot,
  transpilePackages: [
    "@bionova/polaris-handlers",
    "@forwardimpact/libui",
    "@forwardimpact/libformat",
  ],
  webpack(config) {
    config.resolve.alias[handlersTemplatesDir] = templatesStub;
    return config;
  },
};

export default nextConfig;
