-- Non-terrain RLS policies. The terrain seed migrations already emit
-- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY public_read … FOR
-- SELECT USING (true)` for every table they produce (conditions, sites,
-- researchers, trials, criteria, both junctions, condition_embeddings, and the
-- six prose tables). This migration adds ONLY the policies terrain cannot know
-- about, so there is no policy-name collision (see plan-a-02 § Step 5).

-- Staff writes on trials + criteria (read stays public via terrain's public_read).
CREATE POLICY trials_staff_write ON trials FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY trials_staff_update ON trials FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_write ON criteria FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'staff');
CREATE POLICY criteria_staff_update ON criteria FOR UPDATE USING (auth.jwt() ->> 'role' = 'staff');

-- interest_signals: anonymous insert, staff read.
CREATE POLICY interest_signals_anon_insert ON interest_signals FOR INSERT WITH CHECK (true);
CREATE POLICY interest_signals_staff_read ON interest_signals FOR SELECT USING (auth.jwt() ->> 'role' = 'staff');

-- Service role bypass for Edge Functions: unrestricted on every product table.
GRANT ALL ON
  conditions, sites, researchers, trials, criteria, trial_conditions, trial_sites,
  condition_embeddings, condition_explainers, trial_faqs, consent_summaries,
  site_descriptions, patient_stories, therapy_descriptions, interest_signals
  TO service_role;
