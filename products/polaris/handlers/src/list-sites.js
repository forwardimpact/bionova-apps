/**
 * listSites — all trial sites, optionally filtered by specialty, each carrying
 * its description prose.
 *
 * @module list-sites
 */

/**
 * @param {object} ctx
 * @param {{ db: object }} ctx.data
 * @param {object} [ctx.options] - { specialty? }
 * @returns {Promise<{ sites: object[] }>}
 */
export async function listSites(ctx) {
  const { db } = ctx.data;
  const { specialty } = ctx.options ?? {};

  let query =
    "sites?select=id,name,address,city,state,country,org_ref,capacity,specialties&order=name";
  if (specialty) {
    // Array containment: specialties @> {specialty}.
    query += `&specialties=cs.{${encodeURIComponent(specialty)}}`;
  }
  const sites = (await db.get(query)) ?? [];

  const descriptions =
    (await db.get("site_descriptions?select=site_id,description")) ?? [];
  const byId = new Map(descriptions.map((d) => [d.site_id, d.description]));

  return {
    sites: sites.map((s) => ({ ...s, description: byId.get(s.id) ?? null })),
  };
}
