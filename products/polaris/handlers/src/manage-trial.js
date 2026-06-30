/**
 * manageTrial — staff-only trial view + bounded update. Read mode returns the
 * trial with nested criteria/sites/conditions plus interest-signal aggregates;
 * patch mode applies an allowlisted update first, then reads back.
 *
 * @module manage-trial
 */

const ALLOWED_UPDATE_KEYS = new Set([
  "status",
  "current_enrollment",
  "estimated_end_date",
  "arms",
]);

/**
 * @param {object} ctx
 * @param {{ db: object, token?: string }} ctx.data
 * @param {{ id: string }} ctx.args
 * @param {object} [ctx.options] - { update?: string } JSON patch
 * @returns {Promise<{ trial: object, signals: object }>}
 */
export async function manageTrial(ctx) {
  const { id } = ctx.args ?? {};
  const token = ctx.data?.token;
  if (!token) {
    throw new Error("manageTrial requires ctx.data.token (staff JWT)");
  }
  const { db } = ctx.data;
  const eq = `eq.${encodeURIComponent(id)}`;

  // Patch mode: validate + allowlist, then PATCH with the staff token.
  if (ctx.options?.update) {
    let patch;
    try {
      patch = JSON.parse(ctx.options.update);
    } catch (e) {
      throw new Error(`--update must be valid JSON: ${e.message}`);
    }
    const safe = Object.fromEntries(
      Object.entries(patch).filter(([k]) => ALLOWED_UPDATE_KEYS.has(k)),
    );
    if (Object.keys(safe).length === 0) {
      throw new Error(
        `--update must contain at least one of: ${[...ALLOWED_UPDATE_KEYS].join(", ")}`,
      );
    }
    await db.patch(`trials?id=${eq}`, safe, { token });
  }

  // Read back the trial with nested criteria, sites, and conditions.
  const trials =
    (await db.get(
      `trials?id=${eq}&select=*,criteria(*),trial_sites(sites(*)),trial_conditions(conditions(*))`,
      { token },
    )) ?? [];
  const trial = trials[0] ?? null;

  // Aggregate interest signals by match_score (staff-only SELECT).
  const signalRows =
    (await db.get(`interest_signals?trial_id=${eq}&select=match_score`, {
      token,
    })) ?? [];
  const counts = { eligible: 0, possibly_eligible: 0, not_eligible: 0 };
  for (const s of signalRows) {
    if (counts[s.match_score] !== undefined) counts[s.match_score]++;
  }

  return {
    trial,
    signals: { ...counts, total: signalRows.length },
  };
}
