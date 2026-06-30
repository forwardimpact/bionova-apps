-- interest_signals: anonymous interest indicator (no PII).
-- trial_id is TEXT (not UUID) to match render-sql.js's emitted trials.id type.
CREATE TABLE interest_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id TEXT NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  screener_answers JSONB NOT NULL,
  match_score TEXT NOT NULL
    CHECK (match_score IN ('eligible', 'possibly_eligible', 'not_eligible')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX interest_signals_trial_id_idx ON interest_signals(trial_id);
CREATE INDEX interest_signals_match_score_idx ON interest_signals(match_score);

ALTER TABLE interest_signals ENABLE ROW LEVEL SECURITY;
