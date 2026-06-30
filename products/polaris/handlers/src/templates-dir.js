/**
 * Surface-agnostic resolved path to the shared Mustache templates directory.
 *
 * A surface that wants markdown fills these templates with a handler's return
 * value via `@forwardimpact/libtemplate`:
 *
 *   import { TEMPLATES_DIR } from "@bionova/polaris-handlers/templates";
 *   import { createTemplateLoader } from "@forwardimpact/libtemplate";
 *   import { createDefaultRuntime } from "@forwardimpact/libutil";
 *   const loader = createTemplateLoader(TEMPLATES_DIR, createDefaultRuntime());
 *   const md = loader.render("search-trials.md", await searchTrials(ctx));
 *
 * @module templates-dir
 */
export const TEMPLATES_DIR = new URL("../templates/", import.meta.url).pathname;
