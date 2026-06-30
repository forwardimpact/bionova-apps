-- Non-terrain RLS policies. The terrain seed migrations already emit
-- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY public_read … FOR
-- SELECT USING (true)` for every table they produce (conditions, sites,
-- researchers, trials, criteria, both junctions, condition_embeddings, and the
-- six prose tables). This migration adds ONLY the policies terrain cannot know
-- about, so there is no policy-name collision (see plan-a-02 § Step 5).

-- Ensure the auth.jwt() helper exists. GoTrue defines it at runtime, but the
-- policies below depend on it, so define the canonical Supabase version here so
-- this migration is self-contained regardless of whether GoTrue has migrated yet.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$ SELECT coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb) $$;

-- Staff writes on trials + criteria (read stays public via terrain's public_read).
CREATE POLICY trials_staff_write ON trials FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY trials_staff_update ON trials FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_write ON criteria FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_update ON criteria FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');

-- interest_signals: anonymous insert, staff read.
-- RLS policies gate rows but NOT base-table privileges; anon must also hold the
-- INSERT grant or the insert fails with "permission denied" before RLS runs.
CREATE POLICY interest_signals_anon_insert ON interest_signals FOR INSERT WITH CHECK (true);
CREATE POLICY interest_signals_staff_read ON interest_signals FOR SELECT USING (auth.jwt() ->> 'role' = 'staff');
GRANT INSERT ON interest_signals TO anon, authenticated;

-- Service role bypass for Edge Functions: unrestricted on every product table.
GRANT ALL ON
  conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites,
  condition_embeddings, condition_explainers, trial_faqs, consent_summaries,
  site_descriptions, patient_stories, therapy_descriptions, interest_signals
  TO service_role;
