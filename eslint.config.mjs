import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "data/synthetic/.build/**",
      "services/polaris-functions/**",
      "products/polaris/site/**",
    ],
  },
  {
    files: ["products/**/*.js", "products/**/*.mjs", "scripts/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // `Bun` is the bun runtime global (Bun.semver in scripts/engines-gate.mjs);
      // the other four are the Node/web globals the scripts already rely on.
      globals: { process: "readonly", console: "readonly", fetch: "readonly", URL: "readonly", Bun: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
