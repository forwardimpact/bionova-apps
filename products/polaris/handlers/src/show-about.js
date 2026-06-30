/**
 * showAbout — static BioNova metadata (mission, partnerships, contact) read
 * from a YAML file staff can edit without touching code, plus the therapy
 * descriptions prose from the database.
 *
 * @module show-about
 */
import { readFileSync } from "node:fs";

const ABOUT_PATH = new URL("../data/about.yaml", import.meta.url).pathname;

/**
 * Minimal YAML reader for `about.yaml`'s fixed shape: a top-level mapping with
 * three keys — `mission` (a folded `>` block scalar), `partnerships` (a block
 * sequence of strings, possibly wrapped across indented lines), and `contact`
 * (a plain scalar). This avoids adding a `yaml` dependency (and the install
 * churn that would force) for one small, app-owned file. If the about content
 * ever grows beyond this shape, swap this for the `yaml` package.
 *
 * @param {string} text
 * @returns {{ mission: string, partnerships: string[], contact: string }}
 */
export function parseAboutYaml(text) {
  const lines = text.split("\n");
  const out = { mission: "", partnerships: [], contact: "" };
  let i = 0;

  /** Collect indented continuation lines (more indented than `baseIndent`). */
  const collectBlock = (baseIndent) => {
    const collected = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        i++;
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= baseIndent) break;
      collected.push(line.trim());
      i++;
    }
    return collected.join(" ").trim();
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    const keyMatch = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!keyMatch) {
      i++;
      continue;
    }
    const key = keyMatch[1];
    const inline = keyMatch[2];

    if (key === "mission") {
      // Folded block scalar `>`: gather the indented block below.
      i++;
      out.mission =
        inline === ">" || inline === "" || inline === "|"
          ? collectBlock(0)
          : stripQuotes(inline);
    } else if (key === "partnerships") {
      i++;
      // Block sequence: lines starting with `- `, each possibly continued on
      // following more-indented lines.
      while (i < lines.length) {
        const item = lines[i];
        if (item.trim() === "") {
          i++;
          continue;
        }
        const itemIndent = item.length - item.trimStart().length;
        if (itemIndent === 0) break;
        const dash = /^\s*-\s+(.*)$/.exec(item);
        if (!dash) break;
        i++;
        const continuation = collectBlock(itemIndent);
        const value = continuation
          ? `${dash[1].trim()} ${continuation}`
          : dash[1].trim();
        out.partnerships.push(stripQuotes(value));
      }
    } else if (key === "contact") {
      out.contact = stripQuotes(inline);
      i++;
    } else {
      i++;
    }
  }
  return out;
}

function stripQuotes(s) {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * @param {object} ctx
 * @param {{ db: object }} ctx.data
 * @returns {Promise<object>}
 */
export async function showAbout(ctx) {
  const { db } = ctx.data;
  const about = parseAboutYaml(readFileSync(ABOUT_PATH, "utf-8"));

  const therapies =
    (await db.get("therapy_descriptions?select=topic,description")) ?? [];

  return {
    mission: about.mission,
    partnerships: about.partnerships,
    contact: about.contact,
    therapies,
  };
}
