/**
 * checkEligibility — run a trial's screener through the eligibility-check edge
 * function, turn the raw score into a plain-language self-assessment view model
 * (spec 10), then record an anonymous interest signal (no PII).
 *
 * @module check-eligibility
 */

import {
  buildPreCheck,
  invalidAgePreCheck,
  isAgeInputValid,
} from "./eligibility-view.js";

/**
 * @param {object} ctx
 * @param {{ db: object, edgeFunctions: object, token?: string }} ctx.data
 * @param {{ id: string }} ctx.args
 * @param {object} [ctx.options] - screener answers (e.g. { age, conditions, ... })
 * @returns {Promise<object>} view model fields plus match_score/reasons (+ signal_id)
 */
export async function checkEligibility(ctx) {
  const { db, edgeFunctions } = ctx.data;
  const { id } = ctx.args ?? {};
  const answers = ctx.options ?? {};

  // 0. Guard the age answer at the input boundary, before the scorer runs
  // (spec 10 X1 keeps the scorer untouched). A non-integer or negative age
  // would score into an `Age N ...` reason the plain-language view parser
  // cannot read, surfacing as an internal error rather than an answer (#89).
  // Reject it here with a plain-language outcome and record no signal — there
  // is no score to record.
  if (!isAgeInputValid(answers.age)) {
    return { ...invalidAgePreCheck(), match_score: "possibly_eligible", reasons: [] };
  }

  const eq = `eq.${encodeURIComponent(id)}`;

  // 1. Evaluate eligibility via the edge function (reads criteria.custom[]).
  const result =
    (await edgeFunctions.invoke("eligibility-check", {
      trial_id: id,
      ...answers,
    })) ?? {};

  const match_score = result.match_score ?? "not_eligible";
  const reasons = result.reasons ?? [];

  // 2. Read the trial's criteria (same shape show-trial.js proves) and resolve
  // its required + excluded condition slugs (_ -> -) to catalog names, so the
  // pre-check can render conditions readably. The edge fn read criteria too,
  // but the handler cannot import the Deno scorer, so this round-trip is the
  // accepted cost of keeping the edge function untouched (spec 10 X1).
  const criteriaRows =
    (await db.get(`criteria?trial_id=${eq}&select=inclusion,exclusion`)) ?? [];
  const criteria = criteriaRows[0] ?? { inclusion: null, exclusion: null };

  const slugIds = [
    ...(criteria.inclusion?.conditions_required ?? []),
    ...(criteria.exclusion?.conditions_excluded ?? []),
  ].map((s) => s.replaceAll("_", "-"));
  let conditionsById = {};
  if (slugIds.length > 0) {
    // Quote each id — the proven in.(...) idiom (search-trials.js).
    const inList = [...new Set(slugIds)].map((c) => `"${c}"`).join(",");
    const rows =
      (await db.get(`conditions?id=in.(${inList})&select=id,name`)) ?? [];
    conditionsById = Object.fromEntries(rows.map((r) => [r.id, r]));
  }

  const viewModel = buildPreCheck(
    criteria,
    { match_score, reasons },
    conditionsById,
  );

  // 3. Record an anonymous interest signal. Store only the screener answers and
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

  // Spread the view model for the template, but keep match_score/reasons: the
  // web screener reads result.match_score (spec 10 X6) and the handler test
  // asserts both. The template renders view-model fields only, so no enum token
  // reaches output (C3).
  const base = { ...viewModel, match_score, reasons };
  return signal_id !== undefined ? { ...base, signal_id } : base;
}
