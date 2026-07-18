-- Substrate Contract mapping for BioNova Polaris. Normative reference:
-- https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md
--
-- Scaffolded by `fit-terrain substrate init`, then mapped onto Polaris' seed
-- schema. The `fit-terrain substrate` verbs (check / provision / pick / issue)
-- read only this schema — never the vendor tables underneath. See
-- references/bionova-apps/design-a.md § "Interviewing Polaris" in the Forward
-- Impact monorepo for why Polaris is interviewed through the published
-- kata-interview action.
--
-- PostgREST must expose this schema for the service-role verbs to reach it:
-- `substrate` is added to PGRST_DB_SCHEMAS on the postgrest service in
-- docker-compose.yml, and setup.sh reloads the schema cache after db push.

create schema substrate;
grant usage on schema substrate to service_role;

-- Required relation: substrate.people.
--
-- Polaris' only person-shaped seed table is `researchers` (clinical trial
-- principal investigators), so staff map onto substrate.people from there.
-- Polaris roles map onto the mandated engineering-standard columns the way the
-- contract documents for a clinical platform: the research specialty is the
-- discipline, a trial-load proxy is the level, and every row sits on a single
-- `clinical` track.
--
-- The seed carries no reporting hierarchy, but the structural pick invariants
-- need one (a persona has a manager and manages at least one direct). We
-- synthesize a deterministic chain by id order — each researcher reports to the
-- next by id, the last reports to no one — so the middle of the chain
-- satisfies both invariants. This is a view-level mapping for interview
-- support, not fabricated base data.
create view substrate.people as
with ranked as (
  select
    r.id,
    r.name,
    r.email,
    r.specialty,
    coalesce(cardinality(r.trial_ids), 0) as trial_count,
    row_number() over (order by r.id)     as rn
  from researchers r
)
select
  r.email                                                            as email,
  r.name                                                             as name,
  'human'                                                            as kind,
  m.email                                                            as manager_email,
  r.specialty                                                        as team_id,
  initcap(r.specialty)                                               as team_name,
  r.specialty                                                        as discipline,
  case when r.trial_count >= 2 then 'senior' else 'associate' end    as level,
  'clinical'                                                         as track
from ranked r
left join ranked m on m.rn = r.rn + 1;

-- Optional relation: substrate.evidence — declared absent.
-- Polaris has no per-person authored-evidence table, so the evidence pick
-- invariants (persona authors evidence; manages a direct who does) drop and
-- only the structural set runs. `check` reports this as info, not failure.

-- Optional relation: substrate.discovery — declared absent.
-- `issue` writes an identity-only `.substrate.json` (persona and manager email
-- plus timestamp, no navigation ids).

-- Grants run after the views exist.
grant select on all tables in schema substrate to service_role;
