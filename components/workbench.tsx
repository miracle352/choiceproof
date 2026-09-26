"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { diffWordsWithSpace, type Change } from "diff";
import type { PathSceneState } from "@/components/decision-path-scene";
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

const DecisionPathScene = dynamic(
  () => import("@/components/decision-path-scene").then((module) => module.DecisionPathScene),
  { ssr: false, loading: () => <div className="path-scene path-scene-loading" aria-hidden="true" /> },
);

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
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);

  const request = useMemo(() => ({ question: question.trim(), answers: answers.map((item) => item.trim()), input: originalInput.trim() }), [question, answers, originalInput]);
  const reviewStatus = compare ? classifyChallengeReview({
    originalAnswer: compare.original.selectedAnswer,
    challengedAnswer: compare.challenged.selectedAnswer,
    expectedAnswer: expectedAnswer || null,
    meaningPreserved,
  }) : null;
  const removedAnswers = version ? version.answers.filter((answer) => !candidateAnswers.includes(answer)) : [];
  const answersChanged = Boolean(compare && compare.original.selectedAnswer !== compare.challenged.selectedAnswer);
  const sceneState: PathSceneState = !liveConfigured
    ? "sample"
    : error
      ? "failed"
      : reviewStatus === "VERIFIED_FAILURE"
        ? "verified"
        : compare
          ? answersChanged ? "changed" : "stable"
          : "idle";
  const busyLabel = busy === "quick" || busy === "propose"
    ? "SERV is generating bounded challenge inputs…"
    : busy === "compare"
      ? "Running the original and challenged inputs…"
      : busy === "save"
        ? "Saving the labeled case…"
        : busy === "suggest"
          ? "SERV is drafting a revision candidate…"
          : busy === "evaluate"
            ? "Rerunning labeled and held-out cases…"
            : "";

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
      requestAnimationFrame(() => resultHeadingRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Comparison failed.");
    } finally { setBusy(null); }
  }

  async function runQuickChallenge() {
    setBusy("quick"); setError(null); setEvaluation(null);
    try {
      const proposalData = await postJson<{ challenges: ChallengeProposal[] }>("/api/challenges", request);
      const selected = proposalData.challenges.find((item) => item.kind === "conflicting_evidence") ?? proposalData.challenges[0];
      setProposals(proposalData.challenges);
      setChallengeKind(selected.kind);
      setChallengeInput(selected.input);
      setBusy("compare");
      const data = await postJson<CompareResult>("/api/compare", {
        nodeId,
        question: request.question,
        answers: request.answers,
        originalInput: request.input,
        challengeInput: selected.input,
        challengeKind: selected.kind,
      });
      setCompare(data);
      setNodeId(data.nodeId);
      setVersion(data.version);
      setExpectedAnswer("");
      setMeaningPreserved(null);
      setCandidateQuestion(data.version.question);
      setCandidateAnswers(data.version.answers);
      requestAnimationFrame(() => resultHeadingRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Live challenge failed.");
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
    <>
      <a className="skip-link" href="#workbench">Skip to workbench</a>
      <header className="topbar">
        <a className="brand" href="#workbench" aria-label="Faultline home"><span className="brand-mark">F</span><span>FAULTLINE</span></a>
        <nav className="topnav" aria-label="Workbench sections">
          <a href="#workbench">Run</a><a href="#matrix">Matrix</a><a href="#revision">Revision</a>
        </nav>
        <div className="status-cluster">
          <span className={`system-badge ${liveConfigured ? "badge-live" : "badge-sample"}`}><i />{liveConfigured ? "LIVE" : "SAMPLE"}</span>
          <span className={`system-badge ${persistenceConfigured ? "badge-ready" : "badge-failed"}`}><i />{persistenceConfigured ? "PRIVATE DB" : "NO DB"}</span>
        </div>
      </header>

      <main id="main-content">
        <section className="product-hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow">OPEN DECISION TESTING / SERV REASONING</p>
            <h1 id="page-title">Find where a decision breaks.</h1>
            <p>Run one bounded decision across controlled input changes. See the exact fault line, label the outcome, and test the next version.</p>
            <ol className="flow-strip" aria-label="Sixty-second workflow">
              <li><b>01</b>Edit input</li><li><b>02</b>Run challenge</li><li><b>03</b>Review change</li><li><b>04</b>Rerun revision</li>
            </ol>
          </div>
          <DecisionPathScene state={sceneState} originalAnswer={compare?.original.selectedAnswer} challengedAnswer={compare?.challenged.selectedAnswer} />
        </section>

        {(!liveConfigured || !persistenceConfigured) && (
          <aside className="sample-banner" role="status">
            <strong>{!liveConfigured ? "SAMPLE — READ ONLY, NOT A LIVE RUN" : "PERSISTENCE UNAVAILABLE"}</strong>
            <span>{!liveConfigured && !persistenceConfigured
              ? "Configure SERV_API_KEY and DATABASE_URL to enable live tests."
              : !liveConfigured
                ? "Configure SERV_API_KEY to enable live decisions."
                : "Configure DATABASE_URL before running or saving cases."}</span>
          </aside>
        )}

        <section className="workbench-shell" id="workbench" aria-labelledby="workbench-title" aria-busy={Boolean(busy)}>
          <div className="workbench-heading">
            <div><span className="section-index">01</span><div><p className="kicker">PRIMARY WORKBENCH</p><h2 id="workbench-title">Run a live challenge</h2></div></div>
            <span className="version-chip">{version ? `DECISION V${version.versionNumber}` : "UNSAVED DECISION"}</span>
          </div>

          <div className="run-grid">
            <div className="input-column">
              <label className="field-label" htmlFor="original">Input to test</label>
              <textarea className="mono-area primary-input" id="original" rows={7} value={originalInput} onChange={(event) => { setOriginalInput(event.target.value); if (challengeKind === "manual") setChallengeInput(event.target.value); }} disabled={!liveConfigured || Boolean(busy)} />
              <div className="input-meta"><span>Replace every field if needed</span><span>Private to this browser owner</span></div>
              <div className="primary-actions">
                <button className="run-button quick-run" type="button" onClick={runQuickChallenge} disabled={interactionDisabled || !originalInput.trim()}>
                  <span>{busy === "quick" ? "GENERATING CHALLENGE…" : busy === "compare" ? "RUNNING BOTH INPUTS…" : "RUN LIVE CHALLENGE"}</span><span aria-hidden="true">↗</span>
                </button>
                <button className="outline-button" type="button" onClick={generateChallenges} disabled={interactionDisabled}>{busy === "propose" ? "GENERATING…" : "CHOOSE CHALLENGE"}</button>
              </div>
            </div>

            <details className="decision-config">
              <summary><span>Decision boundary</span><strong>{answers.length} allowed answers</strong></summary>
              <div className="config-body">
                <label className="field-label" htmlFor="question">Decision question</label>
                <textarea id="question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!liveConfigured || Boolean(busy)} />
                <div className="field-row"><span className="field-label">Allowed answers</span><span className="field-count">{answers.length}/5</span></div>
                <div className="answers-list">
                  {answers.map((answer, index) => <div className="answer-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Allowed answer ${index + 1}`} value={answer} onChange={(event) => updateAnswer(index, event.target.value)} disabled={!liveConfigured || Boolean(busy)} /><button type="button" aria-label={`Remove answer ${answer || index + 1}`} onClick={() => answers.length > 2 && setAnswers((current) => current.filter((_, i) => i !== index))} disabled={answers.length <= 2 || Boolean(busy)}>×</button></div>)}
                </div>
                {answers.length < 5 && <button className="text-button" type="button" onClick={() => setAnswers((current) => [...current, ""])} disabled={interactionDisabled}>+ Add answer</button>}
              </div>
            </details>
          </div>

          {busyLabel && <div className="operation-status" role="status" aria-live="polite"><i className="spinner" aria-hidden="true" /><span>{busyLabel}</span><small>Live progress only — no simulated steps.</small></div>}

          {error && <div className="run-error" role="alert"><span className="run-label run-label-failed">FAILED</span><div><strong>The run did not complete.</strong><p>{error}</p></div></div>}

          {proposals.length > 0 && <div className="challenge-lab">
            <div className="challenge-lab-head"><div><p className="kicker">CHALLENGE SET</p><h3>Choose or edit the perturbation</h3></div><button className="text-button" type="button" onClick={() => { setChallengeKind("manual"); setChallengeInput(originalInput); }}>Write manually</button></div>
            <div className="proposal-tabs" role="tablist" aria-label="Generated challenges">{proposals.map((proposal) => <button role="tab" aria-selected={challengeKind === proposal.kind} className={challengeKind === proposal.kind ? "active" : ""} key={proposal.kind} onClick={() => { setChallengeKind(proposal.kind); setChallengeInput(proposal.input); }}><span>{KIND_LABELS[proposal.kind]}</span><small>{proposal.label}</small></button>)}</div>
            <label className="field-label" htmlFor="challenge-input">Challenged input · {KIND_LABELS[challengeKind]}</label>
            <textarea className="mono-area" id="challenge-input" rows={6} value={challengeInput} onChange={(event) => { setChallengeKind("manual"); setChallengeInput(event.target.value); }} disabled={!liveConfigured || Boolean(busy)} />
            <button className="run-button compact-run" type="button" onClick={runComparison} disabled={interactionDisabled || challengeInput.trim() === originalInput.trim()}><span>{busy === "compare" ? "RUNNING BOTH INPUTS…" : "RUN THIS CHALLENGE"}</span><span aria-hidden="true">↗</span></button>
          </div>}
        </section>

        {(compare || shownOriginal) && <section className="result-stage" aria-labelledby="result-title">
          <div className="result-heading"><div><span className="section-index">02</span><div><p className="kicker">MEASURED OUTPUT</p><h2 id="result-title" ref={resultHeadingRef} tabIndex={-1}>Comparison result</h2></div></div><span className={`run-label ${compare ? "run-label-live" : "run-label-sample"}`}>{compare ? "LIVE RUN" : "SAMPLE"}</span></div>
          {compare ? <>
            <div className={`answer-banner ${answersChanged ? "answer-banner-changed" : "answer-banner-stable"}`}><span>{answersChanged ? "ANSWER CHANGED" : "ANSWER STABLE"}</span><strong>{compare.original.selectedAnswer}<i aria-hidden="true">→</i>{compare.challenged.selectedAnswer}</strong></div>
            <DiffView before={originalInput} after={challengeInput} />
            <div className="result-pair"><RawResult title="ORIGINAL" result={compare.original} /><RawResult title="CHALLENGED" result={compare.challenged} /></div>
            <div className={`review-status status-${reviewStatus?.toLowerCase().replaceAll("_", "-")}`}>
              <span>REVIEW STATUS</span><strong>{reviewStatus?.replaceAll("_", " ")}</strong>
              {reviewStatus === "ANSWER_CHANGED_REVIEW_NEEDED" && <p>A changed answer is a signal, not a verified error. Set the expected answer and meaning judgment before classification.</p>}
            </div>
            <div className="label-panel">
              <div><label className="field-label" htmlFor="expected">Expected answer</label><select id="expected" value={expectedAnswer} onChange={(event) => setExpectedAnswer(event.target.value)}><option value="">Choose explicitly…</option>{compare.version.answers.map((answer) => <option key={answer}>{answer}</option>)}</select></div>
              <fieldset><legend className="field-label">Same meaning?</legend><div className="segmented"><button type="button" aria-pressed={meaningPreserved === true} className={meaningPreserved === true ? "active" : ""} onClick={() => setMeaningPreserved(true)}>Yes</button><button type="button" aria-pressed={meaningPreserved === false} className={meaningPreserved === false ? "active" : ""} onClick={() => setMeaningPreserved(false)}>No</button></div></fieldset>
              <div><label className="field-label" htmlFor="case-set">Test set</label><select id="case-set" value={setKind} onChange={(event) => setSetKind(event.target.value as "labeled" | "held_out")}><option value="labeled">Labeled</option><option value="held_out">Held-out</option></select></div>
              <button className="save-button" type="button" onClick={saveLabeledCase} disabled={!expectedAnswer || meaningPreserved == null || Boolean(busy)}>{busy === "save" ? "SAVING…" : "SAVE CASE"}</button>
            </div>
          </> : <div className="sample-result"><span>SAMPLE — NOT LIVE</span><strong>{shownOriginal?.selectedAnswer}</strong><p>Illustrative output only. No request was sent to SERV.</p></div>}
        </section>}

        <section className="matrix-stage" id="matrix" aria-labelledby="matrix-title">
          <div className="section-heading"><div><span className="section-index">03</span><div><p className="kicker">PRIVATE TEST MATRIX</p><h2 id="matrix-title">Cases that must keep passing</h2></div></div><p>{cases.length} saved · held-out cases stay out of revision prompts</p></div>
          {cases.length ? <div className="test-matrix" role="table" aria-label="Saved decision cases"><div className="matrix-row matrix-head" role="row"><span>SET</span><span>PERTURBATION</span><span>EXPECTED</span><span>ORIGINAL</span><span>CHALLENGE</span><span>VERDICT</span></div>{cases.map((item) => <div className="matrix-row" role="row" key={item.id}><span><b className={`set-pill ${item.setKind}`}>{item.setKind.replace("_", " ")}</b></span><span data-label="Perturbation">{KIND_LABELS[item.challengeKind]}</span><span data-label="Expected">{item.expectedAnswer}</span><span data-label="Original">{item.originalAnswer}</span><span data-label="Challenge">{item.challengedAnswer}</span><span data-label="Verdict"><b className={`verdict-pill verdict-${item.status.toLowerCase().replaceAll("_", "-")}`}>{item.status.replaceAll("_", " ")}</b></span></div>)}</div> : <div className="empty-box">Your first reviewed challenge will appear here.</div>}
        </section>

        <section className="revision-stage" id="revision" aria-labelledby="revision-title">
          <div className="section-heading"><div><span className="section-index">04</span><div><p className="kicker">VERSION COMPARISON</p><h2 id="revision-title">Test the next decision</h2></div></div><button className="outline-button" type="button" onClick={suggestRevision} disabled={interactionDisabled || !cases.some((item) => item.setKind === "labeled" && item.meaningPreserved)}>{busy === "suggest" ? "SUGGESTING…" : "ASK SERV FOR CANDIDATE"}</button></div>
          <div className="version-comparison">
            <article><header><span>BASELINE</span><b>V{version?.versionNumber ?? 1}</b></header><p>{version?.question ?? question}</p><ul>{(version?.answers ?? answers).map((answer) => <li key={answer}>{answer}</li>)}</ul></article>
            <div className="version-divider" aria-hidden="true"><span>→</span></div>
            <article className="candidate-version"><header><span>{candidateSource === "serv" ? "SERV CANDIDATE" : "EDITED CANDIDATE"}</span><b>V{evaluation?.candidateVersion.versionNumber ?? (version?.versionNumber ?? 1) + 1}</b></header><label className="field-label" htmlFor="candidate-question">Candidate question</label><textarea id="candidate-question" rows={4} value={candidateQuestion} onChange={(event) => { setCandidateSource("user"); setCandidateQuestion(event.target.value); }} /><span className="field-label">Candidate answers</span><div className="answers-list">{candidateAnswers.map((answer, index) => <div className="answer-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Candidate answer ${index + 1}`} value={answer} onChange={(event) => { setCandidateSource("user"); setCandidateAnswers((current) => current.map((item, i) => i === index ? event.target.value : item)); }} /><button type="button" aria-label={`Remove candidate answer ${answer || index + 1}`} disabled={candidateAnswers.length <= 2} onClick={() => setCandidateAnswers((current) => current.filter((_, i) => i !== index))}>×</button></div>)}</div>{candidateAnswers.length < 5 && <button className="text-button" type="button" onClick={() => setCandidateAnswers((current) => [...current, ""])}>+ Add candidate answer</button>}</article>
          </div>
          {removedAnswers.length > 0 && <div className="mapping-panel"><h3>Explicit label mapping required</h3><p>Cases using removed labels remain <strong>NEEDS RELABELING</strong> until mapped.</p>{removedAnswers.map((oldAnswer) => <label key={oldAnswer}><span>{oldAnswer}</span><select aria-label={`Map removed label ${oldAnswer}`} value={labelMapping[oldAnswer] ?? ""} onChange={(event) => setLabelMapping((current) => ({ ...current, [oldAnswer]: event.target.value || null }))}><option value="">Needs relabeling</option>{candidateAnswers.filter(Boolean).map((answer) => <option key={answer}>{answer}</option>)}</select></label>)}</div>}
          <button className="run-button evaluate-button" type="button" onClick={evaluateRevision} disabled={interactionDisabled || cases.length === 0}><span>{busy === "evaluate" ? "RERUNNING ALL CASES…" : "RERUN MATRIX AGAINST CANDIDATE"}</span><span aria-hidden="true">↗</span></button>

          {evaluation && <div className="evaluation-report">
            <div className={`evaluation-summary ${evaluation.summary.regressions ? "has-regression" : "no-regression"}`}><span>MEASURED RESULT · VERSION {evaluation.candidateVersion.versionNumber}</span><strong>{evaluation.summary.regressions ? `${evaluation.summary.regressions} REGRESSION${evaluation.summary.regressions === 1 ? "" : "S"} DETECTED` : "NO MEASURED REGRESSIONS IN THIS TEST SET"}</strong><p>{evaluation.summary.evaluated} evaluated · {evaluation.summary.needsRelabeling} needs relabeling. This is not a global safety claim.</p></div>
            <div className="evaluation-groups">{(["labeled", "held_out"] as const).map((kind) => <section key={kind}><h3>{kind === "labeled" ? "Labeled cases" : "Held-out set"}</h3>{evaluation.results.filter((item) => item.setKind === kind).map((item) => <article className={`evaluation-row verdict-${item.verdict?.toLowerCase() ?? "relabel"}`} key={item.caseId}><span>{item.status === "NEEDS_RELABELING" ? "NEEDS RELABELING" : item.verdict?.replaceAll("_", " ")}</span>{item.status === "EVALUATED" && <strong>{item.baselineAnswer} → {item.candidateAnswer} <small>expected {item.expectedAnswer}</small></strong>}</article>)}</section>)}</div>
          </div>}
        </section>

        <footer><span>FAULTLINE / OPEN TRACK 2026</span><span>SERV REASONING V2 · PRIVATE BY DEFAULT</span></footer>
      </main>
    </>
  );
}
