/**
 * @bionova/polaris-handlers — surface-agnostic business logic.
 *
 * Each handler is `async (ctx) => data` where `ctx = { data, args, options }`.
 * `data` carries the clients built by `createDataContext`; `args` are
 * positional inputs (an id); `options` are flag inputs. Handlers return plain
 * data — rendering (ANSI for the CLI, JSX for the web) belongs to the surface.
 *
 * @module index
 */
export { searchTrials } from "./search-trials.js";
export { showTrial } from "./show-trial.js";
export { showCondition } from "./show-condition.js";
export { checkEligibility } from "./check-eligibility.js";
export { listSites } from "./list-sites.js";
export { listStories } from "./list-stories.js";
export { showAbout } from "./show-about.js";
export { manageTrial } from "./manage-trial.js";

export { createDataContext } from "./clients/postgrest.js";
export { TEMPLATES_DIR } from "./templates-dir.js";
