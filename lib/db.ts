import "server-only";

import { randomUUID } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { stableCaseId } from "@/lib/case-id";
import type { DecisionSuccess, DecisionVersion, PersistedCase, WorkspaceSnapshot } from "@/lib/contracts";
import type { ChallengeKind, DecisionRequest } from "@/lib/contracts";
import type { CaseSet, LabelMapping, ReviewClassification } from "@/lib/domain";

let schemaPromise: Promise<void> | null = null;

export class DatabaseAccessError extends Error {
  constructor(
    public readonly code: "DATABASE_CONNECTION_FAILED" | "DATABASE_SCHEMA_FAILED" | "DATABASE_QUERY_FAILED",
  ) {
    super(code);
    this.name = "DatabaseAccessError";
  }
}

export function classifyDatabaseError(error: unknown): DatabaseAccessError {
  if (error instanceof DatabaseAccessError) return error;
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : "";
  if (message.includes("connect") || message.includes("fetch failed") || message.includes("timeout") || message.includes("econn")) {
    return new DatabaseAccessError("DATABASE_CONNECTION_FAILED");
  }
  if (message.includes("relation") || message.includes("column") || message.includes("schema") || message.includes("permission") || message.includes("syntax")) {
    return new DatabaseAccessError("DATABASE_SCHEMA_FAILED");
  }
  return new DatabaseAccessError("DATABASE_QUERY_FAILED");
}

function databaseUrl() {
  return process.env.DATABASE_URL?.trim() || null;
}

export function isPersistenceConfigured() {
  return Boolean(databaseUrl());
}

function client(): NeonQueryFunction<false, false> {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_NOT_CONFIGURED");
  return neon(url);
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = client();
      await sql.query(`CREATE TABLE IF NOT EXISTS cp_nodes (
        id text PRIMARY KEY, owner_hash text NOT NULL, title text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await sql.query("CREATE INDEX IF NOT EXISTS cp_nodes_owner_updated_idx ON cp_nodes (owner_hash, updated_at DESC)");
      await sql.query(`CREATE TABLE IF NOT EXISTS cp_versions (
        id text PRIMARY KEY, node_id text NOT NULL REFERENCES cp_nodes(id) ON DELETE CASCADE,
        version_number integer NOT NULL, question text NOT NULL, answers jsonb NOT NULL,
        candidate_source text NOT NULL CHECK (candidate_source IN ('user', 'serv')),
        label_mapping jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (node_id, version_number)
      )`);
      await sql.query(`CREATE TABLE IF NOT EXISTS cp_runs (
        id text PRIMARY KEY, node_id text NOT NULL REFERENCES cp_nodes(id) ON DELETE CASCADE,
        version_id text NOT NULL REFERENCES cp_versions(id) ON DELETE CASCADE, case_id text,
        run_kind text NOT NULL, input_text text NOT NULL, selected_answer text NOT NULL,
        model text NOT NULL, provider text, latency_ms integer NOT NULL, raw_response jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await sql.query("CREATE INDEX IF NOT EXISTS cp_runs_node_created_idx ON cp_runs (node_id, created_at DESC)");
      await sql.query(`CREATE TABLE IF NOT EXISTS cp_cases (
        id text PRIMARY KEY, node_id text NOT NULL REFERENCES cp_nodes(id) ON DELETE CASCADE,
        source_version_id text NOT NULL REFERENCES cp_versions(id) ON DELETE CASCADE,
        set_kind text NOT NULL CHECK (set_kind IN ('labeled', 'held_out')), challenge_kind text NOT NULL,
        original_input text NOT NULL, challenge_input text NOT NULL, original_answer text NOT NULL,
        challenged_answer text NOT NULL, expected_answer text NOT NULL, meaning_preserved boolean NOT NULL,
        status text NOT NULL, original_run_id text REFERENCES cp_runs(id), challenged_run_id text REFERENCES cp_runs(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
      await sql.query("CREATE INDEX IF NOT EXISTS cp_cases_node_set_idx ON cp_cases (node_id, set_kind, created_at DESC)");
    })().catch((error) => {
      schemaPromise = null;
      throw classifyDatabaseError(error);
    });
  }
  await schemaPromise;
}

type VersionRow = {
  id: string;
  node_id: string;
  version_number: number;
  question: string;
  answers: string[];
  candidate_source: "user" | "serv";
  created_at: string;
};

function toVersion(row: VersionRow): DecisionVersion {
  return {
    id: row.id,
    nodeId: row.node_id,
    versionNumber: row.version_number,
    question: row.question,
    answers: row.answers,
    candidateSource: row.candidate_source,
    createdAt: row.created_at,
  };
}

type CaseRow = {
  id: string;
  node_id: string;
  source_version_id: string;
  set_kind: CaseSet;
  challenge_kind: ChallengeKind;
  original_input: string;
  challenge_input: string;
  original_answer: string;
  challenged_answer: string;
  expected_answer: string;
  meaning_preserved: boolean;
  status: string;
  created_at: string;
};

function toCase(row: CaseRow): PersistedCase {
  return {
    id: row.id,
    nodeId: row.node_id,
    sourceVersionId: row.source_version_id,
    setKind: row.set_kind,
    challengeKind: row.challenge_kind,
    originalInput: row.original_input,
    challengeInput: row.challenge_input,
    originalAnswer: row.original_answer,
    challengedAnswer: row.challenged_answer,
    expectedAnswer: row.expected_answer,
    meaningPreserved: row.meaning_preserved,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function getWorkspace(ownerHash: string): Promise<WorkspaceSnapshot> {
  if (!isPersistenceConfigured()) {
    return { node: null, version: null, cases: [], persistenceConfigured: false };
  }
  await ensureSchema();
  const sql = client();
  const nodes = await sql.query(
    "SELECT id, title FROM cp_nodes WHERE owner_hash = $1 ORDER BY updated_at DESC LIMIT 1",
    [ownerHash],
  ) as Array<{ id: string; title: string }>;
  const node = nodes[0];
  if (!node) return { node: null, version: null, cases: [], persistenceConfigured: true };

  const versions = await sql.query(
    "SELECT id, node_id, version_number, question, answers, candidate_source, created_at FROM cp_versions WHERE node_id = $1 ORDER BY version_number DESC LIMIT 1",
    [node.id],
  ) as VersionRow[];
  const cases = await sql.query(
    "SELECT id, node_id, source_version_id, set_kind, challenge_kind, original_input, challenge_input, original_answer, challenged_answer, expected_answer, meaning_preserved, status, created_at FROM cp_cases WHERE node_id = $1 ORDER BY created_at DESC LIMIT 50",
    [node.id],
  ) as CaseRow[];
  return {
    node,
    version: versions[0] ? toVersion(versions[0]) : null,
    cases: cases.map(toCase),
    persistenceConfigured: true,
  };
}

export async function ensureNodeVersion(input: {
  ownerHash: string;
  nodeId?: string | null;
  decision: DecisionRequest;
  candidateSource?: "user" | "serv";
  labelMapping?: LabelMapping;
}) {
  await ensureSchema();
  const sql = client();
  let nodeId = input.nodeId ?? null;

  if (nodeId) {
    const owned = await sql.query("SELECT id FROM cp_nodes WHERE id = $1 AND owner_hash = $2", [nodeId, input.ownerHash]);
    if (!owned.length) throw new Error("NODE_NOT_FOUND");
  } else {
    nodeId = randomUUID();
    await sql.query(
      "INSERT INTO cp_nodes (id, owner_hash, title) VALUES ($1, $2, $3)",
      [nodeId, input.ownerHash, input.decision.question.slice(0, 120)],
    );
  }

  const existing = await sql.query(
    "SELECT id, node_id, version_number, question, answers, candidate_source, created_at FROM cp_versions WHERE node_id = $1 ORDER BY version_number DESC LIMIT 1",
    [nodeId],
  ) as VersionRow[];
  const latest = existing[0];
  if (
    latest &&
    latest.question === input.decision.question &&
    JSON.stringify(latest.answers) === JSON.stringify(input.decision.answers)
  ) {
    return { nodeId, version: toVersion(latest) };
  }

  const versionId = randomUUID();
  const versionNumber = (latest?.version_number ?? 0) + 1;
  await sql.query(
    "INSERT INTO cp_versions (id, node_id, version_number, question, answers, candidate_source, label_mapping) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)",
    [
      versionId,
      nodeId,
      versionNumber,
      input.decision.question,
      JSON.stringify(input.decision.answers),
      input.candidateSource ?? "user",
      JSON.stringify(input.labelMapping ?? {}),
    ],
  );
  await sql.query("UPDATE cp_nodes SET updated_at = now() WHERE id = $1", [nodeId]);
  return {
    nodeId,
    version: {
      id: versionId,
      nodeId,
      versionNumber,
      question: input.decision.question,
      answers: input.decision.answers,
      candidateSource: input.candidateSource ?? "user",
      createdAt: new Date().toISOString(),
    } satisfies DecisionVersion,
  };
}

export async function saveRun(input: {
  nodeId: string;
  versionId: string;
  caseId?: string | null;
  runKind: string;
  sourceInput: string;
  result: DecisionSuccess;
}) {
  await ensureSchema();
  const id = randomUUID();
  await client().query(
    "INSERT INTO cp_runs (id, node_id, version_id, case_id, run_kind, input_text, selected_answer, model, provider, latency_ms, raw_response) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)",
    [id, input.nodeId, input.versionId, input.caseId ?? null, input.runKind, input.sourceInput, input.result.selectedAnswer, input.result.model, input.result.provider, input.result.latencyMs, JSON.stringify(input.result.raw)],
  );
  return id;
}

export async function saveCase(input: {
  ownerHash: string;
  nodeId: string;
  sourceVersionId: string;
  setKind: CaseSet;
  challengeKind: ChallengeKind;
  originalInput: string;
  challengeInput: string;
  originalAnswer: string;
  challengedAnswer: string;
  expectedAnswer: string;
  meaningPreserved: boolean;
  status: ReviewClassification;
  originalRunId: string;
  challengedRunId: string;
}) {
  await ensureSchema();
  const sql = client();
  const owned = await sql.query("SELECT id FROM cp_nodes WHERE id = $1 AND owner_hash = $2", [input.nodeId, input.ownerHash]);
  if (!owned.length) throw new Error("NODE_NOT_FOUND");
  const existing = await sql.query(
    "SELECT id, node_id, source_version_id, set_kind, challenge_kind, original_input, challenge_input, original_answer, challenged_answer, expected_answer, meaning_preserved, status, created_at FROM cp_cases WHERE original_run_id = $1 AND challenged_run_id = $2 LIMIT 1",
    [input.originalRunId, input.challengedRunId],
  ) as CaseRow[];
  if (existing[0]) return toCase(existing[0]);
  const id = stableCaseId(input);
  await sql.query(
    "INSERT INTO cp_cases (id, node_id, source_version_id, set_kind, challenge_kind, original_input, challenge_input, original_answer, challenged_answer, expected_answer, meaning_preserved, status, original_run_id, challenged_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING",
    [id, input.nodeId, input.sourceVersionId, input.setKind, input.challengeKind, input.originalInput, input.challengeInput, input.originalAnswer, input.challengedAnswer, input.expectedAnswer, input.meaningPreserved, input.status, input.originalRunId, input.challengedRunId],
  );
  const rows = await sql.query(
    "SELECT id, node_id, source_version_id, set_kind, challenge_kind, original_input, challenge_input, original_answer, challenged_answer, expected_answer, meaning_preserved, status, created_at FROM cp_cases WHERE (id = $1) OR (original_run_id = $2 AND challenged_run_id = $3) ORDER BY (id = $1) DESC LIMIT 1",
    [id, input.originalRunId, input.challengedRunId],
  ) as CaseRow[];
  return toCase(rows[0]);
}

export async function getOwnedMeasuredComparison(input: {
  ownerHash: string;
  nodeId: string;
  versionId: string;
  originalRunId: string;
  challengedRunId: string;
}) {
  await ensureSchema();
  const rows = await client().query(
    `SELECT
       v.id AS version_id, v.question, v.answers,
       original.input_text AS original_input, original.selected_answer AS original_answer,
       challenged.input_text AS challenge_input, challenged.selected_answer AS challenged_answer
     FROM cp_versions v
     JOIN cp_nodes n ON n.id = v.node_id
     JOIN cp_runs original ON original.id = $4 AND original.node_id = v.node_id AND original.version_id = v.id
     JOIN cp_runs challenged ON challenged.id = $5 AND challenged.node_id = v.node_id AND challenged.version_id = v.id
     WHERE v.id = $2 AND v.node_id = $3 AND n.owner_hash = $1
     LIMIT 1`,
    [input.ownerHash, input.versionId, input.nodeId, input.originalRunId, input.challengedRunId],
  ) as Array<{
    version_id: string;
    question: string;
    answers: string[];
    original_input: string;
    original_answer: string;
    challenge_input: string;
    challenged_answer: string;
  }>;
  if (!rows[0]) throw new Error("RUN_PAIR_NOT_FOUND");
  return {
    question: rows[0].question,
    answers: rows[0].answers,
    originalInput: rows[0].original_input,
    originalAnswer: rows[0].original_answer,
    challengeInput: rows[0].challenge_input,
    challengedAnswer: rows[0].challenged_answer,
  };
}

export async function getOwnedVersionAndCases(ownerHash: string, nodeId: string, versionId: string) {
  await ensureSchema();
  const sql = client();
  const versions = await sql.query(
    `SELECT v.id, v.node_id, v.version_number, v.question, v.answers, v.candidate_source, v.created_at
     FROM cp_versions v JOIN cp_nodes n ON n.id = v.node_id
     WHERE v.id = $1 AND v.node_id = $2 AND n.owner_hash = $3`,
    [versionId, nodeId, ownerHash],
  ) as VersionRow[];
  if (!versions[0]) throw new Error("VERSION_NOT_FOUND");
  const cases = await sql.query(
    "SELECT id, node_id, source_version_id, set_kind, challenge_kind, original_input, challenge_input, original_answer, challenged_answer, expected_answer, meaning_preserved, status, created_at FROM cp_cases WHERE node_id = $1 ORDER BY created_at ASC LIMIT 12",
    [nodeId],
  ) as CaseRow[];
  return { version: toVersion(versions[0]), cases: cases.map(toCase) };
}
