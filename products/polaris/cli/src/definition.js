import { createCli } from "@forwardimpact/libcli";
import { createTemplateLoader } from "@forwardimpact/libtemplate";
import { createTerminalFormatter } from "@forwardimpact/libformat";
import * as handlers from "@bionova/polaris-handlers";
import { TEMPLATES_DIR } from "@bionova/polaris-handlers/templates";

const documentation = [
  {
    title: "BioNova Polaris Guide",
    url: "https://github.com/forwardimpact/bionova-apps/blob/main/products/polaris/README.md",
    description: "How to use bionova-polaris to discover trials.",
  },
];

/**
 * Build the bionova-polaris CLI. Every read command accepts a global `--json`
 * flag that emits the raw handler data instead of templated ANSI output (the
 * smoke script relies on this for cross-surface parity).
 *
 * @param {object} opts
 * @param {import('@forwardimpact/libutil/runtime').Runtime} opts.runtime
 * @param {object} opts.data - InvocationContext data bag ({ env, db, embeddings, edgeFunctions }).
 * @param {URL} [opts.packageJsonUrl]
 */
export function createBionovaCli({ runtime, data, packageJsonUrl }) {
  const templates = createTemplateLoader(TEMPLATES_DIR, runtime);
  const term = createTerminalFormatter();

  const render = (name, result) => term.format(templates.render(`${name}.md`, result));
  const respond = (name, ctx, result) =>
    ctx.options.json ? JSON.stringify(result, null, 2) : render(name, result);

  const definition = {
    name: "bionova-polaris",
    description: "Find clinical trials for which you may be eligible.",
    documentation,
    globalOptions: {
      help: { type: "boolean", short: "h", description: "Show this help" },
      version: { type: "boolean", description: "Show version" },
      json: {
        type: "boolean",
        description: "Emit raw JSON instead of formatted output",
      },
    },
    commands: [
      {
        name: "search",
        description: "Search trials by condition, phase, location.",
        args: [],
        options: {
          condition: { type: "string", description: "Plain-language condition or catalog id" },
          phase: { type: "string", description: "Trial phase (1|2|3|4)" },
          status: { type: "string", description: "Enrollment status (recruiting|active|completed)" },
          location: { type: "string", description: "City or state filter" },
        },
        examples: ["bionova-polaris search --condition=diabetes"],
        handler: async (ctx) => respond("search-trials", ctx, await handlers.searchTrials(ctx)),
      },
      {
        name: "trial",
        description: "Show details for a single trial.",
        args: ["id"],
        handler: async (ctx) => respond("show-trial", ctx, await handlers.showTrial(ctx)),
      },
      {
        name: "condition",
        description: "Show a condition and its plain-language explainer.",
        args: ["id"],
        handler: async (ctx) => respond("show-condition", ctx, await handlers.showCondition(ctx)),
      },
      {
        name: "eligibility",
        description: "Run the eligibility screener for a trial.",
        args: ["id"],
        options: {
          age: { type: "string", description: "Patient age" },
          conditions: { type: "string", description: "Comma-separated condition tags" },
          ecog: { type: "string", description: "ECOG performance status" },
        },
        handler: async (ctx) => respond("check-eligibility", ctx, await handlers.checkEligibility(ctx)),
      },
      {
        name: "sites",
        description: "List enrollment sites.",
        args: [],
        options: { specialty: { type: "string", description: "Filter by specialty" } },
        handler: async (ctx) => respond("list-sites", ctx, await handlers.listSites(ctx)),
      },
      {
        name: "stories",
        description: "List patient stories, optionally by condition.",
        args: [],
        options: { condition: { type: "string", description: "Condition catalog id" } },
        handler: async (ctx) => respond("list-stories", ctx, await handlers.listStories(ctx)),
      },
      {
        name: "about",
        description: "Show information about BioNova.",
        args: [],
        handler: async (ctx) => respond("show-about", ctx, await handlers.showAbout(ctx)),
      },
      {
        name: "admin trial",
        description: "Manage a single trial (staff only).",
        args: ["id"],
        options: {
          token: { type: "string", description: "Staff JWT; defaults to $SUPABASE_SERVICE_ROLE_KEY" },
          update: {
            type: "string",
            description: "JSON patch (allowed keys: status, current_enrollment, estimated_end_date, arms)",
          },
        },
        handler: async (ctx) => {
          const token = ctx.options.token || data.env.SUPABASE_SERVICE_ROLE_KEY;
          const adminCtx = { ...ctx, data: { ...ctx.data, token } };
          return respond("manage-trial", ctx, await handlers.manageTrial(adminCtx));
        },
      },
      {
        name: "repl",
        description: "Open a REPL for interactive trial exploration.",
        args: [],
        handler: (ctx) => import("./repl.js").then((m) => m.startRepl({ ...ctx, runtime })),
      },
    ],
  };

  return createCli(definition, { runtime, packageJsonUrl });
}
