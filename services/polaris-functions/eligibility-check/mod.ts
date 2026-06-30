// eligibility-check — POSTed by the screener UI/CLI. Reads the single criteria
// row for a trial and scores a patient's answers against it. No LLM: the
// inclusion/exclusion custom[] strings are the verbatim screener questions, and
// custom_answers is keyed by that exact string.

import type { Env } from "../env.ts";

// Real criteria schema (one row per trial; verified against rendered seed).
export type Inclusion = {
  age_min: number;
  age_max: number;
  conditions_required: string[];
  ecog_max: number;
  prior_treatments_allowed?: string[];
  custom: string[];
};
export type Exclusion = {
  conditions_excluded: string[];
  active_autoimmune: boolean;
  prior_immunotherapy: boolean;
  custom: string[];
};
export type Criteria = { inclusion: Inclusion; exclusion: Exclusion };

export type EligibilityRequest = {
  trial_id: string;
  age?: number;
  conditions?: string[];
  ecog?: number;
  prior_treatments?: string[];
  custom_answers?: Record<string, boolean>; // keyed by criterion text
};

export type MatchScore = "eligible" | "possibly_eligible" | "not_eligible";
export type EligibilityResponse = { match_score: MatchScore; reasons: string[] };

// Pure scoring. Exclusion match wins outright. Otherwise every inclusion
// criterion must be satisfied for `eligible`; any unknown (missing answer or
// missing field) with no exclusion fail yields `possibly_eligible`; a definite
// inclusion failure yields `not_eligible`.
export function score(criteria: Criteria, req: EligibilityRequest): EligibilityResponse {
  const reasons: string[] = [];
  const answers = req.custom_answers ?? {};
  const patientConditions = req.conditions ?? [];

  // --- Exclusion checks: any match → not_eligible ---
  let excluded = false;

  for (const str of criteria.exclusion.custom) {
    if (answers[str] === true) {
      reasons.push(`Excluded: ${str}`);
      excluded = true;
    }
  }

  const excludedConditionHits = criteria.exclusion.conditions_excluded.filter((c) =>
    patientConditions.includes(c)
  );
  for (const c of excludedConditionHits) {
    reasons.push(`Excluded condition: ${c}`);
    excluded = true;
  }

  if (excluded) return { match_score: "not_eligible", reasons };

  // --- Inclusion checks ---
  let unknown = false;
  let failed = false;
  const inc = criteria.inclusion;

  // age
  if (req.age === undefined) {
    reasons.push("Age not provided");
    unknown = true;
  } else if (req.age >= inc.age_min && req.age <= inc.age_max) {
    reasons.push(`Age ${req.age} within [${inc.age_min}, ${inc.age_max}]`);
  } else {
    reasons.push(`Age ${req.age} outside [${inc.age_min}, ${inc.age_max}]`);
    failed = true;
  }

  // ecog
  if (req.ecog === undefined) {
    reasons.push("ECOG not provided");
    unknown = true;
  } else if (req.ecog <= inc.ecog_max) {
    reasons.push(`ECOG ${req.ecog} <= ${inc.ecog_max}`);
  } else {
    reasons.push(`ECOG ${req.ecog} exceeds max ${inc.ecog_max}`);
    failed = true;
  }

  // required conditions — every one must be present in the patient's set
  if (req.conditions === undefined) {
    if (inc.conditions_required.length > 0) {
      reasons.push("Required conditions not provided");
      unknown = true;
    }
  } else {
    for (const required of inc.conditions_required) {
      if (patientConditions.includes(required)) {
        reasons.push(`Has required condition: ${required}`);
      } else {
        reasons.push(`Missing required condition: ${required}`);
        failed = true;
      }
    }
  }

  // custom inclusion criteria — each must be answered true
  for (const str of inc.custom) {
    const answer = answers[str];
    if (answer === undefined) {
      reasons.push(`Unanswered: ${str}`);
      unknown = true;
    } else if (answer === true) {
      reasons.push(`Meets: ${str}`);
    } else {
      reasons.push(`Does not meet: ${str}`);
      failed = true;
    }
  }

  if (failed) return { match_score: "not_eligible", reasons };
  if (unknown) return { match_score: "possibly_eligible", reasons };
  return { match_score: "eligible", reasons };
}

// Fetches the single criteria row for a trial via PostgREST.
export async function fetchCriteria(trialId: string, env: Env): Promise<Criteria | null> {
  const url = `${env.PGREST_URL}/criteria?trial_id=eq.${
    encodeURIComponent(trialId)
  }&select=inclusion,exclusion`;
  const r = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!r.ok) {
    throw new Error(
      `PostgREST criteria query returned ${r.status}: ${(await r.text()).slice(0, 120)}`,
    );
  }
  const rows = (await r.json()) as Criteria[];
  return rows.length > 0 ? rows[0] : null;
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as EligibilityRequest;
  if (!body.trial_id) {
    return new Response(JSON.stringify({ error: "trial_id is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const criteria = await fetchCriteria(body.trial_id, env);
  if (criteria === null) {
    return new Response(JSON.stringify({ error: `no criteria for trial ${body.trial_id}` }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const result = score(criteria, body);
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
