-- libsyntheticrender emits condition_embeddings.condition_id without a UNIQUE
-- constraint; PostgREST on_conflict upsert (embed-seed in part 04) requires one.
-- Sorts after 20260601000000_interest_signals.sql, before the RLS policies.
CREATE UNIQUE INDEX IF NOT EXISTS condition_embeddings_condition_id_uidx
  ON condition_embeddings(condition_id);
