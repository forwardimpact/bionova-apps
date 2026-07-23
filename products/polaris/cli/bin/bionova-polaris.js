#!/usr/bin/env node
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createDataContext } from "@bionova/polaris-handlers/context";
import { createBionovaCli } from "../src/definition.js";

const runtime = createDefaultRuntime();

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? "http://localhost:8000",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  TEI_URL: process.env.TEI_URL ?? "http://localhost:8080",
};

const data = { env, ...createDataContext(env) };
const cli = createBionovaCli({
  runtime,
  data,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) return 0; // --help / --version already printed
  const result = await cli.dispatch(parsed, { data, deps: { runtime } });
  if (typeof result === "string" && result.length > 0) {
    process.stdout.write(result + "\n");
  }
  // Commands that own their output (e.g. `repl`) return undefined.
  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    process.stderr.write(`bionova-polaris: error: ${err.message}\n`);
    // Surface the transport-layer reason. undici nests it: the wrapped client
    // error carries the "fetch failed" TypeError as `cause`, which in turn
    // carries the real reason (e.g. ECONNREFUSED) as its own `cause`.
    for (let cause = err.cause; cause; cause = cause.cause) {
      process.stderr.write(`  caused by: ${cause.message ?? cause}\n`);
    }
    if (err.code === "STACK_UNREACHABLE") {
      process.stderr.write(
        "  the local stack looks down. bring it up with: just boot\n",
      );
    }
    process.exit(1);
  });
