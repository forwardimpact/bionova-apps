import { Readable } from "node:stream";
import { Repl } from "@forwardimpact/librepl";
import * as handlers from "@bionova/polaris-handlers";

// librepl writes a command's output only when the handler returns a Readable;
// wrap each formatted string in one.
const out = (text) => Readable.from([text.endsWith("\n") ? text : text + "\n"]);

function parseKvArgs(args) {
  const opts = {};
  for (const a of args) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) opts[m[1]] = m[2];
  }
  return opts;
}

function formatTrials(trials) {
  if (!trials || trials.length === 0) return "No trials found.";
  return trials
    .map((t, i) => `[${i}] ${t.id}  ${t.name}  (phase ${t.phase ?? "?"}, ${t.status ?? "?"})`)
    .join("\n");
}

function formatTrialDetail(detail) {
  const t = detail.trial ?? {};
  const lines = [
    `${t.name ?? detail.trial?.id ?? "Trial"}  [${t.id ?? ""}]`,
    `Phase: ${t.phase ?? "?"}   Status: ${t.status ?? "?"}   Sponsor: ${t.sponsor ?? "?"}`,
  ];
  if (detail.conditions?.length) {
    lines.push(`Conditions: ${detail.conditions.map((c) => c.name ?? c.id).join(", ")}`);
  }
  if (detail.faq) lines.push(`\nFAQ:\n${detail.faq}`);
  if (detail.consentSummary) lines.push(`\nConsent summary:\n${detail.consentSummary}`);
  return lines.join("\n");
}

function formatCondition(detail) {
  const c = detail.condition ?? {};
  return [`${c.name ?? c.id ?? "Condition"}  [${c.id ?? ""}]`, "", detail.explainer ?? ""].join("\n");
}

function formatSites(result) {
  const sites = result.sites ?? [];
  if (sites.length === 0) return "No sites found.";
  return sites
    .map((s) => `${s.name} — ${s.city}, ${s.state}${s.description ? `\n  ${s.description}` : ""}`)
    .join("\n");
}

function formatStories(result) {
  const stories = result.stories ?? [];
  if (stories.length === 0) return "No patient stories found.";
  return stories.map((s) => `• ${s.story}`).join("\n\n");
}

/** Open an interactive librepl session for trial exploration. */
export async function startRepl(ctx) {
  const repl = new Repl({
    prompt: "bionova> ",
    state: { lastResults: null },
    documentation: [
      {
        title: "REPL Guide",
        url: "https://github.com/forwardimpact/bionova-apps/blob/main/products/polaris/cli/README.md#repl",
      },
    ],
    commands: {
      search: {
        usage: "/search --condition=<text> — find trials by condition",
        handler: async (args, state) => {
          const result = await handlers.searchTrials({ ...ctx, options: parseKvArgs(args) });
          state.lastResults = result.trials;
          return out(formatTrials(result.trials));
        },
      },
      trial: {
        usage: "/trial <idx|id> — show one trial (idx into last search)",
        handler: async (args, state) => {
          const arg = args[0] ?? "";
          const idx = Number.parseInt(arg, 10);
          const id =
            Number.isInteger(idx) && state.lastResults?.[idx]
              ? state.lastResults[idx].id
              : arg;
          return out(formatTrialDetail(await handlers.showTrial({ ...ctx, args: { id } })));
        },
      },
      condition: {
        usage: "/condition <id> — show a condition and its explainer",
        handler: async (args) =>
          out(formatCondition(await handlers.showCondition({ ...ctx, args: { id: args[0] ?? "" } }))),
      },
      sites: {
        usage: "/sites [--specialty=<name>] — list enrollment sites",
        handler: async (args) =>
          out(formatSites(await handlers.listSites({ ...ctx, options: parseKvArgs(args) }))),
      },
      stories: {
        usage: "/stories [--condition=<id>] — list patient stories",
        handler: async (args) =>
          out(formatStories(await handlers.listStories({ ...ctx, options: parseKvArgs(args) }))),
      },
    },
  });
  await repl.start();
}
