/**
 * searchTrials — find recruiting trials by condition, phase, status, location.
 *
 * @module search-trials
 */

// Known condition catalog ids (hyphenated). A query that exactly matches one of
// these is treated as a catalog lookup; anything else (a phrase with a space, or
// an unrecognised token like "high blood sugar") is treated as plain language
// and routed through semantic search.
const CATALOG_IDS = new Set([
  "lung-cancer",
  "diabetes-t2",
  "cardiovascular",
  "breast-cancer",
  "hypertension",
  "copd",
]);

/**
 * Is the query a plain-language phrase rather than a catalog id?
 * @param {string} q
 */
function isPlainLanguage(q) {
  if (!q) return false;
  if (q.includes(" ")) return true;
  return !CATALOG_IDS.has(q);
}

/**
 * Resolve a condition query to a set of condition ids via the ILIKE path:
 * match against conditions.name and the synonyms array.
 * @param {object} db
 * @param {string} condition
 * @returns {Promise<string[]>}
 */
async function ilikeConditionIds(db, condition) {
  const term = encodeURIComponent(`*${condition}*`);
  // PostgREST `or=` with ilike on name, and `cs`-style array match is awkward,
  // so we fetch the small conditions catalog and filter in JS. The catalog is
  // six rows, so this is cheaper than a clever query.
  const rows = (await db.get("conditions?select=id,name,synonyms")) ?? [];
  const needle = condition.toLowerCase();
  const hits = rows.filter((c) => {
    if (c.name && c.name.toLowerCase().includes(needle)) return true;
    if (Array.isArray(c.synonyms)) {
      return c.synonyms.some((s) => s.toLowerCase().includes(needle));
    }
    return false;
  });
  void term;
  return hits.map((c) => c.id);
}

/**
 * Resolve a plain-language query to condition ids via TEI + the
 * `match_conditions` RPC. Falls back to ILIKE if embedding fails.
 * @param {object} ctx.data
 * @param {string} condition
 * @returns {Promise<string[]>}
 */
async function semanticConditionIds({ db, embeddings }, condition) {
  let vector;
  try {
    vector = await embeddings.embed(condition);
  } catch {
    // Embedding service unavailable: degrade to keyword search rather than
    // returning nothing.
    return ilikeConditionIds(db, condition);
  }
  const matches =
    (await db.rpc("match_conditions", { query_embedding: vector })) ?? [];
  const ids = matches.map((m) => m.condition_id);
  // If semantic search found nothing, fall back to ILIKE so a near-miss query
  // still has a chance.
  if (ids.length === 0) return ilikeConditionIds(db, condition);
  return ids;
}

/**
 * @param {object} ctx
 * @param {{ db: object, embeddings: object }} ctx.data
 * @param {object} [ctx.options] - { condition?, phase?, status?, location? }
 * @returns {Promise<object>}
 */
export async function searchTrials(ctx) {
  const { db } = ctx.data;
  const { condition, phase, status, location } = ctx.options ?? {};

  // 1. Resolve condition → condition ids (semantic or ILIKE).
  let conditionIds = null;
  if (condition) {
    conditionIds = isPlainLanguage(condition)
      ? await semanticConditionIds(ctx.data, condition)
      : CATALOG_IDS.has(condition)
        ? [condition]
        : await ilikeConditionIds(db, condition);
  }

  // 2. Find candidate trial ids via the trial_conditions junction.
  let trialIds = null;
  if (conditionIds) {
    if (conditionIds.length === 0) {
      return {
        trials: [],
        total: 0,
        query: { condition, phase, status, location },
      };
    }
    const inList = conditionIds.map((c) => `"${c}"`).join(",");
    const links =
      (await db.get(
        `trial_conditions?condition_id=in.(${inList})&select=trial_id`,
      )) ?? [];
    trialIds = [...new Set(links.map((l) => l.trial_id))];
    if (trialIds.length === 0) {
      return {
        trials: [],
        total: 0,
        query: { condition, phase, status, location },
      };
    }
  }

  // 3. Build the trials query with phase/status filters + nested conditions.
  const params = [
    "select=id,name,protocol_id,phase,therapeutic_area,sponsor,status," +
      "target_enrollment,current_enrollment,start_date,estimated_end_date,arms," +
      "trial_conditions(conditions(id,name)),trial_sites(site_id)",
  ];
  if (trialIds) {
    const inList = trialIds.map((t) => `"${t}"`).join(",");
    params.push(`id=in.(${inList})`);
  }
  if (phase) params.push(`phase=eq.${encodeURIComponent(phase)}`);
  if (status) params.push(`status=eq.${encodeURIComponent(status)}`);

  let rows = (await db.get(`trials?${params.join("&")}`)) ?? [];

  // 4. Location filter via the trial's sites (city/state). Done after the main
  // query because PostgREST cannot filter a parent on an embedded child column.
  if (location) {
    const needle = location.toLowerCase();
    const siteRows =
      (await db.get("sites?select=id,city,state")) ?? [];
    const matchingSiteIds = new Set(
      siteRows
        .filter(
          (s) =>
            (s.city && s.city.toLowerCase().includes(needle)) ||
            (s.state && s.state.toLowerCase().includes(needle)),
        )
        .map((s) => s.id),
    );
    rows = rows.filter((t) =>
      (t.trial_sites ?? []).some((ts) => matchingSiteIds.has(ts.site_id)),
    );
  }

  // 5. Shape the result. Flatten nested conditions; count sites.
  const trials = rows.map((t) => {
    const conditions = (t.trial_conditions ?? [])
      .map((tc) => tc.conditions)
      .filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name }));
    const sites_count = (t.trial_sites ?? []).length;
    const { trial_conditions, trial_sites, ...rest } = t;
    void trial_conditions;
    void trial_sites;
    return { ...rest, conditions, sites_count };
  });

  return {
    trials,
    total: trials.length,
    query: { condition, phase, status, location },
  };
}
