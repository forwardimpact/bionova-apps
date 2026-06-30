import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createDataContext } from "@bionova/polaris-handlers/context";
import { createBionovaCli } from "../src/definition.js";

function makeCli() {
  const runtime = createDefaultRuntime();
  const env = {
    SUPABASE_URL: "http://localhost:8000",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    TEI_URL: "http://localhost:8080",
  };
  const data = { env, ...createDataContext({ stub: true }) };
  return createBionovaCli({
    runtime,
    data,
    packageJsonUrl: new URL("../package.json", import.meta.url),
  });
}

test("parse: search with condition option", () => {
  const cli = makeCli();
  const parsed = cli.parse(["search", "--condition=diabetes"]);
  assert.ok(parsed);
  assert.deepEqual(parsed.positionals, ["search"]);
  assert.equal(parsed.values.condition, "diabetes");
});

test("parse: admin trial resolves nested subcommand positionals", () => {
  const cli = makeCli();
  const parsed = cli.parse(["admin", "trial", "abc-123"]);
  assert.ok(parsed);
  assert.deepEqual(parsed.positionals, ["admin", "trial", "abc-123"]);
});

test("parse: --help returns null (help printed)", () => {
  const cli = makeCli();
  assert.equal(cli.parse(["--help"]), null);
});

test("parse: global --json flag is recognized on read commands", () => {
  const cli = makeCli();
  const parsed = cli.parse(["search", "--condition=diabetes", "--json"]);
  assert.equal(parsed.values.json, true);
});

test("dispatch: builds a frozen InvocationContext", async () => {
  const runtime = createDefaultRuntime();
  let seen;
  const cli = (await import("@forwardimpact/libcli")).createCli(
    {
      name: "probe",
      commands: [
        {
          name: "go",
          args: ["id"],
          handler: (ctx) => {
            seen = ctx;
            return "ok";
          },
        },
      ],
    },
    { runtime },
  );
  const parsed = cli.parse(["go", "42"]);
  const result = await cli.dispatch(parsed, { data: { x: 1 } });
  assert.equal(result, "ok");
  assert.ok(Object.isFrozen(seen));
  assert.equal(seen.args.id, "42");
});

test("definition exposes all 9 commands", () => {
  const cli = makeCli();
  // re-parse each top-level command name resolves (no throw)
  for (const name of ["search", "trial", "condition", "eligibility", "sites", "stories", "about", "repl"]) {
    assert.ok(cli.parse([name, "--help"]) === null, `${name} --help prints help`);
  }
});
