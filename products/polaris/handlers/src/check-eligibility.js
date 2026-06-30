/**
 * checkEligibility — run a trial's screener through the eligibility-check edge
 * function, then record an anonymous interest signal (no PII).
 *
 * @module check-eligibility
 */

/**
 * @param {object} ctx
 * @param {{ db: object, edgeFunctions: object, token?: string }} ctx.data
 * @param {{ id: string }} ctx.args
 * @param {object} [ctx.options] - screener answers (e.g. { age, conditions, ... })
 * @returns {Promise<{ match_score: string, reasons: any, signal_id?: string }>}
 */
export async function checkEligibility(ctx) {
  const { db, edgeFunctions } = ctx.data;
  const { id } = ctx.args ?? {};
  const answers = ctx.options ?? {};

  // 1. Evaluate eligibility via the edge function (reads criteria.custom[]).
  const result =
    (await edgeFunctions.invoke("eligibility-check", {
      trial_id: id,
      ...answers,
    })) ?? {};

  const match_score = result.match_score ?? "not_eligible";
  const reasons = result.reasons ?? [];

  // 2. Record an anonymous interest signal. Store only the screener answers and
  // the score — never PII. Do NOT request return=representation: the
  // interest_signals SELECT policy is staff-only, so an anon insert that asked
  // to read the row back would 401.
  let signal_id;
  try {
    const inserted = await db.post("interest_signals", {
      trial_id: id,
      screener_answers: answers,
      match_score,
    });
    // With no representation requested PostgREST returns 201 + null body; an
    // array only comes back if a caller passed a staff token + representation.
    if (Array.isArray(inserted) && inserted[0]?.id) {
      signal_id = inserted[0].id;
    }
  } catch {
    // Recording interest is best-effort; a failed insert must not block the
    // eligibility answer the user asked for.
  }

  return signal_id !== undefined
    ? { match_score, reasons, signal_id }
    : { match_score, reasons };
}
