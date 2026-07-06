/**
 * buildPreCheck — turn the eligibility-check edge function's flat `reasons`
 * grammar into a plain-language self-assessment view model, for any surface.
 *
 * The handler cannot import the Deno scorer, so this classifies the scorer's
 * exact reason literals (spec 10 design § "The two substrates", table 1). A
 * reason matching none of the known prefixes throws, so a scorer grammar drift
 * is caught by a test rather than silently mis-bucketed.
 *
 * @module eligibility-view
 */

// Fixed, patient-readable summary per score. No raw enum token reaches output.
const SUMMARY = {
  eligible:
    "Based on what you shared, you likely meet this trial's main requirements.",
  possibly_eligible:
    "Based on what you shared, you may fit this trial, but some requirements could not be checked.",
  not_eligible:
    "Based on what you shared, you likely do not fit one or more of this trial's requirements.",
};

const DISCLAIMER =
  "This is a self-assessment, not a medical decision or a determination of eligibility.";
const NEXT_STEP = "To find out if you qualify, contact the trial coordinator.";

// A condition slug the catalog cannot resolve to a readable name. Never labeled
// (that would fabricate a clinical name); routed to coordinator-questions.
const UNRESOLVED_CONDITION_LINE =
  "This trial states a condition in clinical terms. Confirm this one with the coordinator.";

// Patient values live only in the reason string, not in `criteria`; anchor the
// parse and let a no-match fall through to the fail-loud throw below.
const AGE_RE = /^Age (\d+) (within|outside) \[(\d+), (\d+)\]$/;

/**
 * Is the screener's `age` answer a valid age at the input boundary?
 *
 * A valid age is a whole number of years. The scorer folds any finite value —
 * a fraction like 55.5, or a negative — into an `Age N ...` reason, but AGE_RE
 * above reads only a non-negative integer, so a non-whole age falls through to
 * the fail-loud throw and surfaces as an internal error, not a plain-language
 * answer (#89). The handler rejects such an age before the scorer runs; this
 * predicate draws the line. Absent or blank age is valid here: the scorer
 * reports it as "Age not provided", which already routes to the plain "add your
 * age" unclear line.
 *
 * @param {unknown} age - the raw `age` screener answer (number or CLI string).
 * @returns {boolean}
 */
export function isAgeInputValid(age) {
  if (age === undefined || age === null) return true; // absent → not rejected
  if (typeof age === "number") return Number.isInteger(age) && age >= 0;
  if (typeof age === "string") {
    const trimmed = age.trim();
    if (trimmed === "") return true; // blank → treated as not provided
    return /^\d+$/.test(trimmed);
  }
  return false;
}

/**
 * The pre-check view model for an age that failed {@link isAgeInputValid}.
 * Same shape buildPreCheck returns, so the template renders it unchanged: a
 * plain-language reason the check did not run and the one step to fix it.
 *
 * @returns {ReturnType<typeof buildPreCheck>}
 */
export function invalidAgePreCheck() {
  return {
    summary:
      "We could not check your eligibility because the age you entered is not a whole number of years.",
    supports: [],
    against: [],
    unclear: ["Enter a whole number for your age, such as 54, then check again."],
    coordinatorQuestions: [],
    disclaimer: DISCLAIMER,
    nextStep: NEXT_STEP,
  };
}

/**
 * @param {{ inclusion: object|null, exclusion: object|null }} criteria
 *   the `criteria?...&select=inclusion,exclusion` row shape; tolerates null halves.
 * @param {{ match_score: string, reasons: string[] }} scoreResult
 *   the edge function's response.
 * @param {Record<string, { id: string, name: string }>} [conditionsById]
 *   catalog rows keyed by resolved (hyphenated) condition id.
 * @returns {{ summary: string, supports: string[], against: string[],
 *   unclear: string[], coordinatorQuestions: string[], disclaimer: string,
 *   nextStep: string }}
 */
export function buildPreCheck(criteria, scoreResult, conditionsById = {}) {
  const { match_score, reasons } = scoreResult ?? {};
  const supports = [];
  const against = [];
  const unclear = [];

  // coordinatorQuestions: the criteria custom[] strings verbatim first
  // (inclusion then exclusion), then any unresolvable-condition fallback line
  // discovered while classifying reasons. The scorer's <custom> reasons are
  // recognized and dropped — their weight is already folded into match_score.
  const inclusionCustom = criteria?.inclusion?.custom ?? [];
  const exclusionCustom = criteria?.exclusion?.custom ?? [];
  const coordinatorQuestions = [...inclusionCustom, ...exclusionCustom];

  // Normalize slug (_ -> -) and look up the catalog name.
  const resolveName = (slug) => conditionsById[slug.replaceAll("_", "-")]?.name;
  const slugOf = (reason) => reason.slice(reason.indexOf(": ") + 2);

  for (const reason of reasons ?? []) {
    // --- custom[] reasons: never bucketed; carried verbatim above (S2/C2) ---
    if (
      reason.startsWith("Meets: ") ||
      reason.startsWith("Does not meet: ") ||
      reason.startsWith("Unanswered: ") ||
      reason.startsWith("Excluded: ")
    ) {
      continue;
    }

    // --- age (only reason carrying a shown numeral) ---
    const ageMatch = AGE_RE.exec(reason);
    if (ageMatch) {
      const [, n, direction, min, max] = ageMatch;
      if (direction === "within") {
        supports.push(
          `Your age (${n}) is within this trial's range of ${min} to ${max}.`,
        );
      } else {
        against.push(
          `This trial enrolls ages ${min} to ${max}; the age you gave (${n}) is outside that range.`,
        );
      }
      continue;
    }
    if (reason === "Age not provided") {
      unclear.push(
        "This trial has an age range. Add your age to check whether you fall inside it.",
      );
      continue;
    }

    // --- ECOG (jargon; rendered with no numeral, matched by prefix) ---
    if (reason === "ECOG not provided") {
      unclear.push(
        "This trial has a physical-ability (performance status) requirement a coordinator can help you gauge.",
      );
      continue;
    }
    if (reason.startsWith("ECOG ") && reason.includes(" exceeds max ")) {
      against.push(
        "This trial asks for a level of day-to-day physical ability above what you reported.",
      );
      continue;
    }
    if (reason.startsWith("ECOG ") && reason.includes(" <= ")) {
      supports.push(
        "Your reported ability to handle daily activities meets this trial's requirement.",
      );
      continue;
    }

    // --- conditions (resolve slug -> name; unresolvable -> coordinator) ---
    // Match "Excluded condition:" before the dropped "Excluded:" custom prefix
    // above; the two do not collide under startsWith, but order is explicit.
    if (reason.startsWith("Has required condition: ")) {
      const name = resolveName(slugOf(reason));
      if (name)
        supports.push(`You reported ${name}, which this trial requires.`);
      else coordinatorQuestions.push(UNRESOLVED_CONDITION_LINE);
      continue;
    }
    if (reason.startsWith("Missing required condition: ")) {
      const name = resolveName(slugOf(reason));
      if (name)
        against.push(`This trial requires ${name}, which you did not report.`);
      else coordinatorQuestions.push(UNRESOLVED_CONDITION_LINE);
      continue;
    }
    if (reason === "Required conditions not provided") {
      unclear.push(
        "This trial requires one or more specific conditions. Add your conditions to check.",
      );
      continue;
    }
    if (reason.startsWith("Excluded condition: ")) {
      const name = resolveName(slugOf(reason));
      if (name)
        against.push(
          `This trial cannot enroll people with ${name}, which you reported.`,
        );
      else coordinatorQuestions.push(UNRESOLVED_CONDITION_LINE);
      continue;
    }

    throw new Error(`Unrecognized eligibility reason: ${reason}`);
  }

  const summary = SUMMARY[match_score];
  if (!summary) throw new Error(`Unrecognized match_score: ${match_score}`);

  return {
    summary,
    supports,
    against,
    unclear,
    coordinatorQuestions,
    disclaimer: DISCLAIMER,
    nextStep: NEXT_STEP,
  };
}
