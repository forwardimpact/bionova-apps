/**
 * showCondition — one condition plus its plain-language explainer prose.
 *
 * @module show-condition
 */

/**
 * @param {object} ctx
 * @param {{ db: object }} ctx.data
 * @param {{ id: string }} ctx.args
 * @returns {Promise<object>}
 */
export async function showCondition(ctx) {
  const { db } = ctx.data;
  const { id } = ctx.args ?? {};
  const eq = `eq.${encodeURIComponent(id)}`;

  const rows = (await db.get(`conditions?id=${eq}&select=*`)) ?? [];
  const explainerRows =
    (await db.get(`condition_explainers?condition_id=${eq}&select=explainer`)) ??
    [];

  return {
    condition: rows[0] ?? null,
    explainer: explainerRows[0]?.explainer ?? null,
  };
}
