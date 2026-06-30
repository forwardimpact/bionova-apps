/**
 * Public entry for building the handler data context.
 *
 * Surfaces (CLI in part 06, web in part 07) call `createDataContext(env, opts)`
 * and pass the result as `ctx.data` when dispatching to a handler.
 *
 * @module context
 */
export { createDataContext } from "./clients/postgrest.js";
