/**
 * listStories — patient stories, optionally filtered by condition, ordered by
 * story_index.
 *
 * @module list-stories
 */

/**
 * @param {object} ctx
 * @param {{ db: object }} ctx.data
 * @param {object} [ctx.options] - { condition? } (a condition catalog id)
 * @returns {Promise<{ stories: object[] }>}
 */
export async function listStories(ctx) {
  const { db } = ctx.data;
  const { condition } = ctx.options ?? {};

  let query =
    "patient_stories?select=id,condition_id,story_index,story&order=story_index";
  if (condition) {
    query += `&condition_id=eq.${encodeURIComponent(condition)}`;
  }
  const stories = (await db.get(query)) ?? [];
  return { stories };
}
