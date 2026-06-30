/**
 * showTrial — full public detail for one trial: criteria, sites, conditions,
 * principal investigator, plus the FAQ and consent summary prose.
 *
 * @module show-trial
 */

/**
 * @param {object} ctx
 * @param {{ db: object }} ctx.data
 * @param {{ id: string }} ctx.args
 * @returns {Promise<object>}
 */
export async function showTrial(ctx) {
  const { db } = ctx.data;
  const { id } = ctx.args ?? {};
  const eq = `eq.${encodeURIComponent(id)}`;

  const trials =
    (await db.get(
      `trials?id=${eq}&select=id,name,protocol_id,phase,therapeutic_area,` +
        `sponsor,status,target_enrollment,current_enrollment,start_date,` +
        `estimated_end_date,arms,principal_investigator_id,project_ref,project_id`,
    )) ?? [];
  const trial = trials[0] ?? null;

  const criteriaRows =
    (await db.get(`criteria?trial_id=${eq}&select=inclusion,exclusion`)) ?? [];
  const criteria = criteriaRows[0]
    ? {
        inclusion: criteriaRows[0].inclusion,
        exclusion: criteriaRows[0].exclusion,
      }
    : { inclusion: null, exclusion: null };

  const siteLinks =
    (await db.get(
      `trial_sites?trial_id=${eq}&select=sites(id,name,address,city,state,country,capacity,specialties)`,
    )) ?? [];
  const sites = siteLinks.map((l) => l.sites).filter(Boolean);

  const conditionLinks =
    (await db.get(
      `trial_conditions?trial_id=${eq}&select=conditions(id,name,severity,synonyms)`,
    )) ?? [];
  const conditions = conditionLinks.map((l) => l.conditions).filter(Boolean);

  let principal_investigator = null;
  if (trial?.principal_investigator_id) {
    const pi =
      (await db.get(
        `researchers?id=eq.${encodeURIComponent(
          trial.principal_investigator_id,
        )}&select=id,name,role,specialty`,
      )) ?? [];
    principal_investigator = pi[0] ?? null;
  }

  const faqRows =
    (await db.get(`trial_faqs?trial_id=${eq}&select=faq`)) ?? [];
  const consentRows =
    (await db.get(`consent_summaries?trial_id=${eq}&select=summary`)) ?? [];

  return {
    trial,
    criteria,
    sites,
    conditions,
    principal_investigator,
    faq: faqRows[0]?.faq ?? null,
    consentSummary: consentRows[0]?.summary ?? null,
  };
}
