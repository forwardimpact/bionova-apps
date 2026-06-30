-- match_conditions: semantic search over condition_embeddings.
--
-- Given a 384-dim query embedding (BAAI/bge-small-en-v1.5 via TEI), return the
-- condition ids whose embedding is closest by cosine distance.
--
-- condition_id is TEXT, not uuid: the terrain pipeline emits conditions.id as a
-- TEXT primary key (hyphenated ids like 'diabetes-t2'), and condition_embeddings
-- carries a TEXT condition_id foreign key. The RETURNS TABLE type matches that.
--
-- match_threshold defaults to 0.3, not 0.7. bge-small cosine similarities for
-- plain-language paraphrases run well below the 0.7 used for near-duplicate
-- detection: "high blood sugar" against the diabetes-t2 explainer embedding
-- scores around 0.4-0.5, and a 0.7 floor would return nothing. 0.3 keeps real
-- paraphrase matches while still excluding unrelated conditions.
CREATE OR REPLACE FUNCTION match_conditions(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE(condition_id text, similarity float)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
    SELECT ce.condition_id, 1 - (ce.embedding <=> query_embedding) AS similarity
    FROM condition_embeddings ce
    WHERE 1 - (ce.embedding <=> query_embedding) > match_threshold
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
END; $$;
