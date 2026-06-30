-- libsyntheticrender emits condition_embeddings.condition_id without a UNIQUE
-- constraint; PostgREST on_conflict upsert (embed-seed in part 04) requires one.
-- Versioned 20260601000005 (distinct 14-digit timestamp): an "a"-suffixed
-- version collides with 20260601000000_interest_signals and supabase db push
-- silently skips it. The index only needs to exist before embed-seed runs.
CREATE UNIQUE INDEX IF NOT EXISTS condition_embeddings_condition_id_uidx
  ON condition_embeddings(condition_id);
