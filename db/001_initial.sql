CREATE TABLE IF NOT EXISTS cp_nodes (
  id text PRIMARY KEY,
  owner_hash text NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cp_nodes_owner_updated_idx
  ON cp_nodes (owner_hash, updated_at DESC);

CREATE TABLE IF NOT EXISTS cp_versions (
  id text PRIMARY KEY,
  node_id text NOT NULL REFERENCES cp_nodes(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  question text NOT NULL,
  answers jsonb NOT NULL,
  candidate_source text NOT NULL CHECK (candidate_source IN ('user', 'serv')),
  label_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, version_number)
);

CREATE TABLE IF NOT EXISTS cp_runs (
  id text PRIMARY KEY,
  node_id text NOT NULL REFERENCES cp_nodes(id) ON DELETE CASCADE,
  version_id text NOT NULL REFERENCES cp_versions(id) ON DELETE CASCADE,
  case_id text,
  run_kind text NOT NULL,
  input_text text NOT NULL,
  selected_answer text NOT NULL,
  model text NOT NULL,
  provider text,
  latency_ms integer NOT NULL,
  raw_response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cp_runs_node_created_idx
  ON cp_runs (node_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cp_cases (
  id text PRIMARY KEY,
  node_id text NOT NULL REFERENCES cp_nodes(id) ON DELETE CASCADE,
  source_version_id text NOT NULL REFERENCES cp_versions(id) ON DELETE CASCADE,
  set_kind text NOT NULL CHECK (set_kind IN ('labeled', 'held_out')),
  challenge_kind text NOT NULL,
  original_input text NOT NULL,
  challenge_input text NOT NULL,
  original_answer text NOT NULL,
  challenged_answer text NOT NULL,
  expected_answer text NOT NULL,
  meaning_preserved boolean NOT NULL,
  status text NOT NULL,
  original_run_id text REFERENCES cp_runs(id),
  challenged_run_id text REFERENCES cp_runs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cp_cases_node_set_idx
  ON cp_cases (node_id, set_kind, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cp_cases_run_pair_unique
  ON cp_cases (original_run_id, challenged_run_id)
  WHERE original_run_id IS NOT NULL AND challenged_run_id IS NOT NULL;
