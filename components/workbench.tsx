"use client";

import { useEffect, useMemo, useState } from "react";
import { diffWordsWithSpace, type Change } from "diff";
import type {
  ChallengeKind,
  ChallengeProposal,
  DecisionRequest,
  DecisionSuccess,
  DecisionVersion,
  PersistedCase,
  WorkspaceSnapshot,
} from "@/lib/contracts";
import { classifyChallengeReview, type LabelMapping } from "@/lib/domain";

type WorkbenchProps = { liveConfigured: boolean; persistenceConfigured: boolean };

type CompareResult = {
  nodeId: string;
  version: DecisionVersion;
  original: DecisionSuccess;
  challenged: DecisionSuccess;
  originalRunId: string;
  challengedRunId: string;
  challengeKind: ChallengeKind;
};

type EvaluationItem = {
  caseId: string;
  setKind: "labeled" | "held_out";
  status: "EVALUATED" | "NEEDS_RELABELING";
  expectedAnswer?: string;
  baselineAnswer?: string;
  candidateAnswer?: string;
  verdict?: "REGRESSION" | "IMPROVEMENT" | "UNCHANGED_PASS" | "UNCHANGED_FAILURE";
  baselineRaw?: unknown;
  candidateRaw?: unknown;
};

type EvaluationResult = {
  candidateVersion: DecisionVersion;
  results: EvaluationItem[];
  summary: { regressions: number; needsRelabeling: number; evaluated: number };
};

const INITIAL: DecisionRequest = {
  question: "Should this refund request be approved, escalated, or declined?",
  answers: ["Approve", "Escalate", "Decline"],
  input:
    "Order #1842 arrived 12 days late. The customer contacted support twice before delivery, the package is unopened, and the request was submitted 4 days after arrival. Policy allows returns within 30 days.",
};

const SAMPLE: DecisionSuccess = {
  ok: true,
  selectedAnswer: "Approve",
  model: "gpt-5.4-mini",
  provider: null,
  gateway: "OpenServ SERV Reasoning",
  latencyMs: 842,
  requestId: "sample_not_a_live_request",
  finishReason: "tool_calls",
  raw: {
    id: "sample_not_a_live_request",
    object: "chat.completion",
    model: "gpt-5.4-mini",
    choices: [{ message: { tool_calls: [{ function: { name: "submit_decision", arguments: "{\"answer\":\"Approve\"}" } }] }, finish_reason: "tool_calls" }],
  },
};

const KIND_LABELS: Record<ChallengeKind, string> = {
  irrelevant_context: "Irrelevant context",
  reordered_evidence: "Reordered evidence",
  ambiguity: "Ambiguity",
  conflicting_evidence: "Conflicting evidence",
  embedded_instruction: "Embedded instruction",
  manual: "Manual challenge",
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { ok: boolean; error?: { message?: string } } & T;
  if (!response.ok || !data.ok) throw new Error(data.error?.message || "The request failed.");
  return data;
}

function DiffView({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  const edit = useMemo(() => changes.reduce((total, part) => ({
    added: total.added + (part.added ? Array.from(part.value).length : 0),
    removed: total.removed + (part.removed ? Array.from(part.value).length : 0),
  }), { added: 0, removed: 0 }), [changes]);

  return (
    <div className="diff-wrap">
      <div className="diff-meta">EXACT TEXT DIFF · +{edit.added} / −{edit.removed} CHARACTERS</div>
      <div className="diff-text" aria-label={`Exact text diff with ${edit.added} added and ${edit.removed} removed characters`}>
        {changes.map((part: Change, index: number) => (
          <span className={part.added ? "diff-add" : part.removed ? "diff-remove" : undefined} key={index}>{part.value}</span>
        ))}
      </div>
    </div>
  );
}

function RawResult({ title, result }: { title: string; result: DecisionSuccess }) {
  return (
    <article className="actual-result">
      <div className="actual-result-head"><span>{title}</span><strong>{result.selectedAnswer}</strong></div>
      <dl className="mini-metrics">
        <div><dt>MODEL</dt><dd>{result.model}</dd></div>
        <div><dt>LATENCY</dt><dd>{result.latencyMs.toLocaleString()} ms</dd></div>
        <div><dt>PROVIDER</dt><dd>{result.provider ?? "Not returned by API"}</dd></div>
      </dl>
      <details><summary>Actual returned data <span>JSON</span></summary><pre>{JSON.stringify(result.raw, null, 2)}</pre></details>
    </article>
  );
}

export function Workbench({ liveConfigured, persistenceConfigured }: WorkbenchProps) {
  const [question, setQuestion] = useState(INITIAL.question);
  const [answers, setAnswers] = useState(INITIAL.answers);
  const [originalInput, setOriginalInput] = useState(INITIAL.input);
  const [challengeInput, setChallengeInput] = useState(INITIAL.input);
  const [challengeKind, setChallengeKind] = useState<ChallengeKind>("manual");
  const [proposals, setProposals] = useState<ChallengeProposal[]>([]);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [version, setVersion] = useState<DecisionVersion | null>(null);
  const [cases, setCases] = useState<PersistedCase[]>([]);
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [meaningPreserved, setMeaningPreserved] = useState<boolean | null>(null);
  const [setKind, setSetKind] = useState<"labeled" | "held_out">("labeled");
  const [candidateQuestion, setCandidateQuestion] = useState(INITIAL.question);
  const [candidateAnswers, setCandidateAnswers] = useState(INITIAL.answers);
  const [candidateSource, setCandidateSource] = useState<"user" | "serv">("user");
  const [labelMapping, setLabelMapping] = useState<LabelMapping>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(() => ({ question: question.trim(), answers: answers.map((item) => item.trim()), input: originalInput.trim() }), [question, answers, originalInput]);
  const reviewStatus = compare ? classifyChallengeReview({
    originalAnswer: compare.original.selectedAnswer,
    challengedAnswer: compare.challenged.selectedAnswer,
    expectedAnswer: expectedAnswer || null,
    meaningPreserved,
  }) : null;
  const removedAnswers = version ? version.answers.filter((answer) => !candidateAnswers.includes(answer)) : [];

  useEffect(() => {
    if (!persistenceConfigured) return;
    void fetch("/api/workspace", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { ok?: boolean; workspace?: WorkspaceSnapshot }) => {
        if (!data.ok || !data.workspace) return;
        const workspace = data.workspace;
        if (workspace.node) setNodeId(workspace.node.id);
        if (workspace.version) {
          setVersion(workspace.version);
          setQuestion(workspace.version.question);
          setAnswers(workspace.version.answers);
          setCandidateQuestion(workspace.version.question);
          setCandidateAnswers(workspace.version.answers);
        }
        setCases(workspace.cases);
        if (workspace.cases[0]) {
          setOriginalInput(workspace.cases[0].originalInput);
          setChallengeInput(workspace.cases[0].challengeInput);
        }
      })
      .catch(() => undefined);
  }, [persistenceConfigured]);

  function updateAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, i) => i === index ? value : answer));
  }

  async function generateChallenges() {
    setBusy("propose"); setError(null);
    try {
      const data = await postJson<{ challenges: ChallengeProposal[] }>("/api/challenges", request);
      setProposals(data.challenges);
      setChallengeKind(data.challenges[0].kind);
      setChallengeInput(data.challenges[0].input);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Challenge generation failed.");
    } finally { setBusy(null); }
  }

  async function runComparison() {
    setBusy("compare"); setError(null); setEvaluation(null);
    try {
      const data = await postJson<CompareResult>("/api/compare", {
        nodeId,
        question: request.question,
        answers: request.answers,
        originalInput: request.input,
        challengeInput,
        challengeKind,
      });
      setCompare(data);
      setNodeId(data.nodeId);
      setVersion(data.version);
      setExpectedAnswer("");
      setMeaningPreserved(null);
      setCandidateQuestion(data.version.question);
      setCandidateAnswers(data.version.answers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Comparison failed.");
    } finally { setBusy(null); }
  }

  async function saveLabeledCase() {
    if (!compare || !expectedAnswer || meaningPreserved == null) return;
    setBusy("save"); setError(null);
    try {
      const data = await postJson<{ case: PersistedCase }>("/api/cases", {
        nodeId: compare.nodeId,
        sourceVersionId: compare.version.id,
        setKind,
        challengeKind: compare.challengeKind,
        originalInput,
        challengeInput,
        originalAnswer: compare.original.selectedAnswer,
        challengedAnswer: compare.challenged.selectedAnswer,
        expectedAnswer,
        meaningPreserved,
        originalRunId: compare.originalRunId,
        challengedRunId: compare.challengedRunId,
      });
      setCases((current) => [data.case, ...current.filter((item) => item.id !== data.case.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Case save failed.");
    } finally { setBusy(null); }
  }

  async function suggestRevision() {
    if (!nodeId || !version) return;
    setBusy("suggest"); setError(null);
    try {
      const data = await postJson<{ candidate: { question: string; answers: string[] } }>("/api/revision/suggest", { nodeId, versionId: version.id });
      setCandidateQuestion(data.candidate.question);
      setCandidateAnswers(data.candidate.answers);
      setCandidateSource("serv");
      setLabelMapping({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revision suggestion failed.");
    } finally { setBusy(null); }
  }

  async function evaluateRevision() {
    if (!nodeId || !version) return;
    setBusy("evaluate"); setError(null);
    try {
      const data = await postJson<EvaluationResult>("/api/revision/evaluate", {
        nodeId,
        baseVersionId: version.id,
        question: candidateQuestion,
        answers: candidateAnswers,
        candidateSource,
        labelMapping,
      });
      setEvaluation(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revision evaluation failed.");
    } finally { setBusy(null); }
  }

  const interactionDisabled = !liveConfigured || !persistenceConfigured || Boolean(busy);
  const shownOriginal = compare?.original ?? (!liveConfigured ? SAMPLE : null);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#decision"><span className="brand-mark">CP</span><span>CHOICEPROOF</span></a>
        <div className="status-cluster">
          <span className="mode-cluster"><i className={`status-dot ${liveConfigured ? "is-live" : "is-sample"}`} />{liveConfigured ? "SERV LIVE" : "SAMPLE MODE"}</span>
          <span className="mode-cluster"><i className={`status-dot ${persistenceConfigured ? "is-live" : "is-sample"}`} />{persistenceConfigured ? "DATABASE READY" : "NO DATABASE"}</span>
        </div>
      </header>

      <section className="intro compact-intro">
        <div><p className="eyebrow">BOUNDED DECISION WORKBENCH</p><h1>Challenge the boundary.<br />Measure what moves.</h1></div>
        <p className="intro-copy">Run the same decision against deliberate input variations. A changed answer starts a review; only your labels can turn it into a verified result.</p>
      </section>

      {(!liveConfigured || !persistenceConfigured) && (
        <aside className="sample-banner" role="status">
          <strong>{!liveConfigured ? "Read-only sample — not a live run." : "Persistence setup required."}</strong>
          <span>{!liveConfigured && !persistenceConfigured
            ? "Add SERV_API_KEY and DATABASE_URL on the server to enable the live workflow."
            : !liveConfigured
              ? "Add SERV_API_KEY on the server to enable live decisions."
              : "Connect DATABASE_URL before running or saving cases."}</span>
        </aside>
      )}

      <section className="stage" id="decision">
        <div className="stage-title"><span>01</span><div><h2>Decision specification</h2><p>Every run is constrained to this answer set.</p></div></div>
        <div className="decision-grid">
          <div className="form-stack">
            <label className="field-label" htmlFor="question">Decision question</label>
            <textarea id="question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!liveConfigured || Boolean(busy)} />
            <div className="field-row"><span className="field-label">Allowed answers</span><span className="field-count">{answers.length}/5</span></div>
            <div className="answers-list">
              {answers.map((answer, index) => <div className="answer-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Allowed answer ${index + 1}`} value={answer} onChange={(event) => updateAnswer(index, event.target.value)} disabled={!liveConfigured || Boolean(busy)} /><button type="button" onClick={() => answers.length > 2 && setAnswers((current) => current.filter((_, i) => i !== index))} disabled={answers.length <= 2 || Boolean(busy)}>×</button></div>)}
            </div>
            {answers.length < 5 && <button className="text-button" type="button" onClick={() => setAnswers((current) => [...current, ""])} disabled={interactionDisabled}>+ Add answer</button>}
          </div>
          <div>
            <label className="field-label" htmlFor="original">Original input</label>
            <textarea className="mono-area" id="original" rows={12} value={originalInput} onChange={(event) => { setOriginalInput(event.target.value); if (challengeKind === "manual") setChallengeInput(event.target.value); }} disabled={!liveConfigured || Boolean(busy)} />
            <p className="privacy-note">Private by default. Inputs are stored only for your anonymous browser owner and are never listed publicly.</p>
          </div>
        </div>
      </section>

      <section className="stage challenge-stage" id="challenge">
        <div className="stage-title"><span>02</span><div><h2>Challenge input</h2><p>Ask SERV for five varied tests, choose one, or write your own.</p></div><button className="outline-button" onClick={generateChallenges} disabled={interactionDisabled}>{busy === "propose" ? "GENERATING…" : "GENERATE 5 CHALLENGES"}</button></div>
        {proposals.length > 0 && <div className="proposal-tabs" role="list">{proposals.map((proposal) => <button className={challengeKind === proposal.kind ? "active" : ""} key={proposal.kind} onClick={() => { setChallengeKind(proposal.kind); setChallengeInput(proposal.input); }}><span>{KIND_LABELS[proposal.kind]}</span><small>{proposal.label}</small></button>)}</div>}
        <div className="challenge-editor">
          <div className="challenge-editor-head"><span className="field-label">{KIND_LABELS[challengeKind]}</span><button className="text-button" onClick={() => { setChallengeKind("manual"); setChallengeInput(originalInput); }}>Write manually</button></div>
          <textarea className="mono-area" rows={8} value={challengeInput} onChange={(event) => { setChallengeKind("manual"); setChallengeInput(event.target.value); }} disabled={!liveConfigured || Boolean(busy)} />
          <button className="run-button" onClick={runComparison} disabled={interactionDisabled || challengeInput.trim() === originalInput.trim()}><span>{busy === "compare" ? "RUNNING BOTH INPUTS…" : "RUN ORIGINAL + CHALLENGE"}</span><span>↗</span></button>
        </div>
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      {(compare || shownOriginal) && <section className="stage result-stage">
        <div className="stage-title"><span>03</span><div><h2>Measured result</h2><p>Exact input change and unmodified provider responses.</p></div></div>
        {compare ? <>
          <DiffView before={originalInput} after={challengeInput} />
          <div className="result-pair"><RawResult title="ORIGINAL" result={compare.original} /><RawResult title="CHALLENGED" result={compare.challenged} /></div>
          <div className={`review-status status-${reviewStatus?.toLowerCase().replaceAll("_", "-")}`}>
            <span>REVIEW STATUS</span><strong>{reviewStatus?.replaceAll("_", " ")}</strong>
            {reviewStatus === "ANSWER_CHANGED_REVIEW_NEEDED" && <p>A changed answer is a signal, not a verified error. Label the expected answer and semantic equivalence below.</p>}
          </div>
          <div className="label-panel">
            <div><label className="field-label" htmlFor="expected">Expected answer</label><select id="expected" value={expectedAnswer} onChange={(event) => setExpectedAnswer(event.target.value)}><option value="">Choose explicitly…</option>{compare.version.answers.map((answer) => <option key={answer}>{answer}</option>)}</select></div>
            <fieldset><legend className="field-label">Does the challenge preserve the original meaning?</legend><div className="segmented"><button type="button" className={meaningPreserved === true ? "active" : ""} onClick={() => setMeaningPreserved(true)}>Yes</button><button type="button" className={meaningPreserved === false ? "active" : ""} onClick={() => setMeaningPreserved(false)}>No</button></div></fieldset>
            <div><label className="field-label" htmlFor="case-set">Test set</label><select id="case-set" value={setKind} onChange={(event) => setSetKind(event.target.value as "labeled" | "held_out")}><option value="labeled">Labeled / revision input</option><option value="held_out">Held-out / evaluation only</option></select></div>
            <button className="save-button" onClick={saveLabeledCase} disabled={!expectedAnswer || meaningPreserved == null || Boolean(busy)}>{busy === "save" ? "SAVING…" : "SAVE LABELED CASE"}</button>
          </div>
        </> : <div className="sample-result"><span>SAMPLE ONLY</span><strong>{shownOriginal?.selectedAnswer}</strong><p>This output is illustrative and was not returned by a live request.</p></div>}
      </section>}

      <section className="stage case-stage">
        <div className="stage-title"><span>04</span><div><h2>Case library</h2><p>{cases.length} private case{cases.length === 1 ? "" : "s"}; held-out cases are excluded from SERV revision suggestions.</p></div></div>
        {cases.length ? <div className="case-table" role="table"><div className="case-table-row case-table-head" role="row"><span>SET</span><span>CHALLENGE</span><span>EXPECTED</span><span>CLASSIFICATION</span></div>{cases.map((item) => <div className="case-table-row" role="row" key={item.id}><span><b className={`set-pill ${item.setKind}`}>{item.setKind.replace("_", " ")}</b></span><span>{KIND_LABELS[item.challengeKind]}</span><span>{item.expectedAnswer}</span><span>{item.status.replaceAll("_", " ")}</span></div>)}</div> : <div className="empty-box">No labeled cases yet. Run and review a challenge to create the first one.</div>}
      </section>

      <section className="stage revision-stage">
        <div className="stage-title"><span>05</span><div><h2>Revision candidate</h2><p>Write a candidate or ask SERV. Nothing is called fixed; every case is rerun.</p></div><button className="outline-button" onClick={suggestRevision} disabled={interactionDisabled || !cases.some((item) => item.setKind === "labeled" && item.meaningPreserved)}>{busy === "suggest" ? "SUGGESTING…" : "ASK SERV FOR CANDIDATE"}</button></div>
        <div className="revision-grid">
          <div><label className="field-label" htmlFor="candidate-question">Candidate question</label><textarea id="candidate-question" rows={4} value={candidateQuestion} onChange={(event) => { setCandidateSource("user"); setCandidateQuestion(event.target.value); }} /></div>
          <div><span className="field-label">Candidate answers</span><div className="answers-list">{candidateAnswers.map((answer, index) => <div className="answer-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Candidate answer ${index + 1}`} value={answer} onChange={(event) => { setCandidateSource("user"); setCandidateAnswers((current) => current.map((item, i) => i === index ? event.target.value : item)); }} /><button type="button" disabled={candidateAnswers.length <= 2} onClick={() => setCandidateAnswers((current) => current.filter((_, i) => i !== index))}>×</button></div>)}</div>{candidateAnswers.length < 5 && <button className="text-button" onClick={() => setCandidateAnswers((current) => [...current, ""])}>+ Add candidate answer</button>}</div>
        </div>
        {removedAnswers.length > 0 && <div className="mapping-panel"><h3>Explicit label mapping required</h3><p>Cases using removed labels stay <strong>NEEDS RELABELING</strong> until mapped.</p>{removedAnswers.map((oldAnswer) => <label key={oldAnswer}><span>{oldAnswer}</span><select value={labelMapping[oldAnswer] ?? ""} onChange={(event) => setLabelMapping((current) => ({ ...current, [oldAnswer]: event.target.value || null }))}><option value="">Needs relabeling</option>{candidateAnswers.filter(Boolean).map((answer) => <option key={answer}>{answer}</option>)}</select></label>)}</div>}
        <button className="run-button evaluate-button" onClick={evaluateRevision} disabled={interactionDisabled || cases.length === 0}><span>{busy === "evaluate" ? "RERUNNING ALL CASES…" : "EVALUATE CANDIDATE ON BOTH SETS"}</span><span>↗</span></button>

        {evaluation && <div className="evaluation-report">
          <div className={`evaluation-summary ${evaluation.summary.regressions ? "has-regression" : "no-regression"}`}><span>MEASURED RESULT · VERSION {evaluation.candidateVersion.versionNumber}</span><strong>{evaluation.summary.regressions ? `${evaluation.summary.regressions} REGRESSION${evaluation.summary.regressions === 1 ? "" : "S"} DETECTED` : "NO MEASURED REGRESSIONS IN THIS TEST SET"}</strong><p>{evaluation.summary.evaluated} evaluated · {evaluation.summary.needsRelabeling} needs relabeling. This is not a global safety claim.</p></div>
          <div className="evaluation-groups">{(["labeled", "held_out"] as const).map((kind) => <section key={kind}><h3>{kind === "labeled" ? "Labeled cases" : "Held-out set"}</h3>{evaluation.results.filter((item) => item.setKind === kind).map((item) => <article className={`evaluation-row verdict-${item.verdict?.toLowerCase() ?? "relabel"}`} key={item.caseId}><span>{item.status === "NEEDS_RELABELING" ? "NEEDS RELABELING" : item.verdict?.replaceAll("_", " ")}</span>{item.status === "EVALUATED" && <strong>{item.baselineAnswer} → {item.candidateAnswer} <small>expected {item.expectedAnswer}</small></strong>}</article>)}</section>)}</div>
        </div>}
      </section>

      <footer><span>CHOICEPROOF / OPEN TRACK 2026</span><span>SERV REASONING V2 · PRIVATE CASES</span></footer>
    </main>
  );
}
