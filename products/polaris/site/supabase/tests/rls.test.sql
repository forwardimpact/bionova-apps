-- pgTAP RLS assertions. Run with `supabase test db` (or
-- `psql -f` against a seeded DB). Exercised at end of part 03, when terrain
-- output + hand-written migrations have all applied.
BEGIN;
SELECT plan(9);

-- RLS is enabled on the security-sensitive tables.
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'trials'),
  'RLS enabled on trials');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'interest_signals'),
  'RLS enabled on interest_signals');

-- The non-terrain policies this repo adds exist.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trials' AND policyname = 'trials_staff_update'),
  'trials_staff_update policy exists');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interest_signals' AND policyname = 'interest_signals_anon_insert'),
  'interest_signals_anon_insert policy exists');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'interest_signals' AND policyname = 'interest_signals_staff_read'),
  'interest_signals_staff_read policy exists');

-- The terrain-emitted public_read policy is present (and not duplicated).
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE tablename = 'trials' AND policyname = 'public_read'),
  1,
  'exactly one public_read policy on trials (no duplicate from this migration)');

-- Behavioural checks under the anon role: read trials, insert an interest
-- signal, but never read interest_signals back (staff-only SELECT).
SET LOCAL ROLE anon;
SELECT ok(
  (SELECT count(*) >= 0 FROM trials),
  'anon can SELECT from trials');
SELECT lives_ok(
  $$INSERT INTO interest_signals (trial_id, screener_answers, match_score)
    VALUES ((SELECT id FROM trials LIMIT 1), '{}'::jsonb, 'eligible')$$,
  'anon can INSERT into interest_signals');
SELECT is(
  (SELECT count(*)::int FROM interest_signals),
  0,
  'anon cannot SELECT interest_signals (staff-only read)');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
