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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
