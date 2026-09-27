"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { diffWordsWithSpace, type Change } from "diff";
import { isResponseCurrent, resolveProductCapabilities, type PersistenceHealth } from "@/lib/capabilities";
import type {
  ChallengeKind,
  ChallengeProposal,
  ComparisonSuccess,
  DecisionRequest,
  DecisionSnapshot,
  DecisionSuccess,
  DecisionVersion,
  PersistedCase,
  JevAnalysis,
  WorkspaceSnapshot,
} from "@/lib/contracts";
import { validateDecisionRequest } from "@/lib/contracts";
import { classifyChallengeReview, repeatedRunDisagrees, type LabelMapping } from "@/lib/domain";
import { REFUND_CHALLENGE, REFUND_EXAMPLE } from "@/lib/example";
import { SplitLens } from "@/components/split-lens";

type WorkbenchProps = { servConfigured: boolean; databaseConfigured: boolean; jevConfigured: boolean };
type BusyState = "decision" | "propose" | "quick" | "compare" | "save" | "publish" | "suggest" | "evaluate" | null;
type RunState = "sample" | "not_tested" | "running" | "live" | "failed";
type OperationError = { code: string; message: string };
type MeasuredDecision = { result: DecisionSuccess; snapshot: DecisionSnapshot };
type JevUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; code: string; reason: string }
  | JevAnalysis;

type EvaluationItem = {
  caseId: string;
  setKind: "labeled" | "held_out";
  status: "EVALUATED" | "NEEDS_RELABELING" | "NOT_COMPARABLE";
  expectedAnswer?: string;
  baselineAnswer?: string;
  candidateAnswer?: string;
  verdict?: "REGRESSION" | "IMPROVEMENT" | "UNCHANGED_PASS" | "UNCHANGED_FAILURE";
};

type EvaluationResult = {
  candidateVersion: DecisionVersion;
  results: EvaluationItem[];
  summary: { regressions: number; needsRelabeling: number; notComparable: number; evaluated: number };
};

const INITIAL: DecisionRequest = REFUND_EXAMPLE;

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

const SAMPLE_CHALLENGE_INPUT = REFUND_CHALLENGE;

const SAMPLE_CHALLENGED: DecisionSuccess = {
  ...SAMPLE,
  selectedAnswer: "Escalate",
  latencyMs: 917,
  requestId: "sample_challenged_not_a_live_request",
  raw: {
    id: "sample_challenged_not_a_live_request",
    object: "chat.completion",
    model: "gpt-5.4-mini",
    choices: [{ message: { tool_calls: [{ function: { name: "submit_decision", arguments: "{\"answer\":\"Escalate\"}" } }] }, finish_reason: "tool_calls" }],
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

const KIND_HELP: Record<ChallengeKind, string> = {
  irrelevant_context: "Adds facts that should not affect the decision.",
  reordered_evidence: "Keeps the facts but changes their order.",
  ambiguity: "Makes one relevant detail less certain.",
  conflicting_evidence: "Adds evidence that points another way.",
  embedded_instruction: "Places an instruction inside the untrusted input.",
  manual: "Write any controlled change you want to test.",
};

class ApiRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null) as ({ ok?: boolean; error?: { code?: string; message?: string } } & T) | null;
  if (!response.ok || !data?.ok) {
    throw new ApiRequestError(data?.error?.code || `HTTP_${response.status}`, data?.error?.message || "The request failed.");
  }
  return data;
}

function snapshotFromDraft(question: string, answers: string[], input: string): DecisionSnapshot {
  return { question: question.trim(), answers: answers.map((answer) => answer.trim()), input: input.trim() };
}

function sameDecisionSnapshot(a: DecisionSnapshot, b: DecisionSnapshot) {
  return a.question === b.question && a.input === b.input && JSON.stringify(a.answers) === JSON.stringify(b.answers);
}

function DiffView({ before, after }: { before: string; after: string }) {
  const changes = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  const edit = useMemo(() => changes.reduce((total, part) => ({
    added: total.added + (part.added ? Array.from(part.value).length : 0),
    removed: total.removed + (part.removed ? Array.from(part.value).length : 0),
  }), { added: 0, removed: 0 }), [changes]);
  const removed = useMemo(() => changes.filter((part) => part.removed).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No removed text", [changes]);
  const added = useMemo(() => changes.filter((part) => part.added).map((part) => part.value.trim()).filter(Boolean).join(" ") || "No added text", [changes]);

  return (
    <div className="diff-block">
      <div className="diff-heading"><span>One changed fact</span><strong>+{edit.added} / -{edit.removed} characters</strong></div>
      <div className="fact-change"><del>{removed}</del><i aria-hidden="true">→</i><ins>{added}</ins></div>
      <details className="exact-diff"><summary>Read exact full-text diff</summary><div className="diff-text" aria-label={`Exact text diff with ${edit.added} added and ${edit.removed} removed characters`}>
        {changes.map((part: Change, index: number) => <span className={part.added ? "diff-add" : part.removed ? "diff-remove" : undefined} key={index}>{part.value}</span>)}
      </div></details>
    </div>
  );
}

function ResultCard({ label, result, sample = false }: { label: string; result: DecisionSuccess; sample?: boolean }) {
  return (
    <article className="result-card">
      <header><span>{label}</span><strong>{result.selectedAnswer}</strong></header>
      <dl>
        <div><dt>Model</dt><dd>{result.model}</dd></div>
        <div><dt>Latency</dt><dd>{result.latencyMs.toLocaleString()} ms</dd></div>
        <div><dt>Provider</dt><dd>{result.provider ?? "Not returned by API"}</dd></div>
      </dl>
      <details>
        <summary>Actual returned data <span>{sample ? "sample JSON" : "JSON"}</span></summary>
        <pre>{JSON.stringify(result.raw, null, 2)}</pre>
      </details>
    </article>
  );
}

function StatusItem({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warning" | "error" }) {
  return <span className={`status-item status-${tone}`}><small>{label}</small><b>{value}</b></span>;
}

export function Workbench({ servConfigured, databaseConfigured, jevConfigured }: WorkbenchProps) {
  const [question, setQuestion] = useState(INITIAL.question);
  const [answers, setAnswers] = useState(INITIAL.answers);
  const [originalInput, setOriginalInput] = useState(INITIAL.input);
  const [decision, setDecision] = useState<MeasuredDecision | null>(null);
  const [challengeInput, setChallengeInput] = useState(INITIAL.input);
  const [challengeKind, setChallengeKind] = useState<ChallengeKind>("manual");
  const [proposals, setProposals] = useState<ChallengeProposal[]>([]);
  const [comparison, setComparison] = useState<ComparisonSuccess | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [version, setVersion] = useState<DecisionVersion | null>(null);
  const [cases, setCases] = useState<PersistedCase[]>([]);
  const [persistenceHealth, setPersistenceHealth] = useState<PersistenceHealth>(databaseConfigured ? "checking" : "not_configured");
  const [workspaceError, setWorkspaceError] = useState<OperationError | null>(null);
  const [workspaceRefresh, setWorkspaceRefresh] = useState(0);
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [expectedConfirmed, setExpectedConfirmed] = useState(false);
  const [meaningPreserved, setMeaningPreserved] = useState<boolean | null>(null);
  const [setKind, setSetKind] = useState<"labeled" | "held_out">("labeled");
  const [savedComparisonKey, setSavedComparisonKey] = useState<string | null>(null);
  const [savedCaseId, setSavedCaseId] = useState<string | null>(null);
  const [savedCaseSet, setSavedCaseSet] = useState<"labeled" | "held_out" | null>(null);
  const [publishConsent, setPublishConsent] = useState(false);
  const [publishedPath, setPublishedPath] = useState<string | null>(null);
  const [repeatDisagreement, setRepeatDisagreement] = useState<{ before: string; after: string } | null>(null);
  const [candidateQuestion, setCandidateQuestion] = useState(INITIAL.question);
  const [candidateAnswers, setCandidateAnswers] = useState(INITIAL.answers);
  const [candidateSource, setCandidateSource] = useState<"user" | "serv">("user");
  const [labelMapping, setLabelMapping] = useState<LabelMapping>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [runState, setRunState] = useState<RunState>(servConfigured ? "not_tested" : "sample");
  const [error, setError] = useState<OperationError | null>(null);
  const [jevState, setJevState] = useState<JevUiState>({ status: "idle" });
  const latestRequestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const jevController = useRef<AbortController | null>(null);
  const jevRequestId = useRef(0);

  const draftSnapshot = useMemo(() => snapshotFromDraft(question, answers, originalInput), [question, answers, originalInput]);
  const capabilities = resolveProductCapabilities({ servConfigured, databaseConfigured, persistenceHealth });
  const reviewStatus = comparison ? classifyChallengeReview({
    originalAnswer: comparison.original.selectedAnswer,
    challengedAnswer: comparison.challenged.selectedAnswer,
    expectedAnswer: expectedConfirmed ? expectedAnswer || null : null,
    meaningPreserved,
    challengeIntent: meaningPreserved == null ? null : meaningPreserved ? "preserve" : "change",
  }) : null;
  const comparisonKey = comparison ? `${comparison.originalRunId}:${comparison.challengedRunId}` : null;
  const comparisonSaved = Boolean(comparisonKey && comparisonKey === savedComparisonKey);
  const answersChanged = Boolean(comparison && comparison.original.selectedAnswer !== comparison.challenged.selectedAnswer);
  const decisionDraftChanged = Boolean(decision && !sameDecisionSnapshot(decision.snapshot, draftSnapshot));
  const comparisonDraftChanged = Boolean(comparison && (
    comparison.snapshot.question !== draftSnapshot.question ||
    comparison.snapshot.originalInput !== draftSnapshot.input ||
    JSON.stringify(comparison.snapshot.answers) !== JSON.stringify(draftSnapshot.answers) ||
    comparison.snapshot.challengeInput !== challengeInput.trim()
  ));
  const removedAnswers = version ? version.answers.filter((answer) => !candidateAnswers.includes(answer)) : [];
  const busyLabel = busy === "decision"
    ? "SERV is testing this decision…"
    : busy === "propose" || busy === "quick"
      ? "SERV is preparing controlled challenge inputs…"
      : busy === "compare"
        ? "SERV is running the original and challenged inputs…"
        : busy === "save"
          ? "Saving this reviewed case…"
          : busy === "suggest"
            ? "SERV is drafting a revision candidate…"
            : busy === "evaluate"
              ? "Rerunning the first 12 saved cases…"
              : "";

  useEffect(() => {
    if (!databaseConfigured) return;
    const controller = new AbortController();
    void requestJson<{ workspace: WorkspaceSnapshot }>("/api/workspace", { cache: "no-store", signal: controller.signal })
      .then((data) => {
        setPersistenceHealth("available");
        setWorkspaceError(null);
        if (data.workspace.node) setNodeId(data.workspace.node.id);
        if (data.workspace.version) {
          setVersion(data.workspace.version);
          setCandidateQuestion(data.workspace.version.question);
          setCandidateAnswers(data.workspace.version.answers);
        }
        setCases(data.workspace.cases);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        const issue = cause instanceof ApiRequestError
          ? { code: cause.code, message: cause.message }
          : { code: "WORKSPACE_UNAVAILABLE", message: "The private workspace could not be loaded. One-off decisions remain available." };
        setPersistenceHealth("failed");
        setWorkspaceError(issue);
      });
    return () => controller.abort();
  }, [databaseConfigured, workspaceRefresh]);

  function retryWorkspace() {
    setPersistenceHealth("checking");
    setWorkspaceError(null);
    setWorkspaceRefresh((value) => value + 1);
  }

  function beginOperation(kind: Exclude<BusyState, null>) {
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const requestId = ++latestRequestId.current;
    setBusy(kind);
    setError(null);
    if (kind === "decision" || kind === "compare" || kind === "quick") setRunState("running");
    return { controller, requestId };
  }

  function finishOperation(requestId: number) {
    if (isResponseCurrent(requestId, latestRequestId.current)) setBusy(null);
  }

  function captureError(cause: unknown, fallback: string, requestId: number, affectsRun = true) {
    if (!isResponseCurrent(requestId, latestRequestId.current)) return;
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    const issue = cause instanceof ApiRequestError
      ? { code: cause.code, message: cause.message }
      : { code: "REQUEST_FAILED", message: fallback };
    setError(issue);
    if (affectsRun) setRunState("failed");
  }

  function post<T>(url: string, body: unknown, signal: AbortSignal) {
    return requestJson<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  }

  async function requestJevAnalysis(measured: ComparisonSuccess) {
    jevController.current?.abort();
    const controller = new AbortController();
    jevController.current = controller;
    const requestId = ++jevRequestId.current;
    setJevState({ status: "loading" });
    try {
      const data = await post<{ ok: true; analysis: JevUiState }>("/api/analysis", {
        nodeId: measured.nodeId,
        versionId: measured.version.id,
        originalRunId: measured.originalRunId,
        challengedRunId: measured.challengedRunId,
      }, controller.signal);
      if (requestId === jevRequestId.current) setJevState(data.analysis);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (requestId !== jevRequestId.current) return;
      const issue = cause instanceof ApiRequestError
        ? { code: cause.code, reason: cause.message }
        : { code: "JEV_REQUEST_FAILED", reason: "Jev analysis could not be loaded." };
      setJevState({ status: "failed", ...issue });
    }
  }

  function validatedSnapshot() {
    const snapshot = snapshotFromDraft(question, answers, originalInput);
    const validation = validateDecisionRequest(snapshot);
    if (!validation.success) {
      setError({ code: "INVALID_INPUT", message: validation.message });
      setRunState("failed");
      return null;
    }
    return { ...validation.data };
  }

  function updateAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, itemIndex) => itemIndex === index ? value : answer));
  }

  async function testDecision() {
    const snapshot = validatedSnapshot();
    if (!snapshot) return;
    const previous = decision;
    const operation = beginOperation("decision");
    try {
      const result = await post<DecisionSuccess>("/api/decision", snapshot, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      setRepeatDisagreement(previous && repeatedRunDisagrees({ sameSnapshot: sameDecisionSnapshot(previous.snapshot, snapshot), previousAnswer: previous.result.selectedAnswer, nextAnswer: result.selectedAnswer })
        ? { before: previous.result.selectedAnswer, after: result.selectedAnswer }
        : null);
      setDecision({ result, snapshot });
      setComparison(null);
      setRunState("live");
      requestAnimationFrame(() => resultHeadingRef.current?.focus());
    } catch (cause) {
      captureError(cause, "The live decision failed.", operation.requestId);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function generateChallenges() {
    const operation = beginOperation("propose");
    const snapshot = snapshotFromDraft(question, answers, originalInput);
    try {
      const data = await post<{ ok: true; challenges: ChallengeProposal[] }>("/api/challenges", snapshot, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      setProposals(data.challenges);
      setChallengeKind(data.challenges[0].kind);
      setChallengeInput(data.challenges[0].input);
    } catch (cause) {
      captureError(cause, "Challenge generation failed.", operation.requestId, false);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function runComparisonWith(input: string, kind: ChallengeKind, operation = beginOperation("compare")) {
    const snapshot = snapshotFromDraft(question, answers, originalInput);
    const data = await post<ComparisonSuccess>("/api/compare", {
      nodeId,
      question: snapshot.question,
      answers: snapshot.answers,
      originalInput: snapshot.input,
      challengeInput: input,
      challengeKind: kind,
    }, operation.controller.signal);
    if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
    setComparison(data);
    void requestJevAnalysis(data);
    setDecision({ result: data.original, snapshot: { question: data.snapshot.question, answers: data.snapshot.answers, input: data.snapshot.originalInput } });
    setNodeId(data.nodeId);
    setVersion(data.version);
    setExpectedAnswer(data.original.selectedAnswer);
    setExpectedConfirmed(false);
    setMeaningPreserved(null);
    setSavedComparisonKey(null);
    setSavedCaseId(null);
    setSavedCaseSet(null);
    setPublishConsent(false);
    setPublishedPath(null);
    setCandidateQuestion(data.version.question);
    setCandidateAnswers(data.version.answers);
    setRunState("live");
    requestAnimationFrame(() => resultHeadingRef.current?.focus());
  }

  async function runComparison() {
    const operation = beginOperation("compare");
    try {
      await runComparisonWith(challengeInput, challengeKind, operation);
    } catch (cause) {
      captureError(cause, "The comparison failed.", operation.requestId);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function runQuickChallenge() {
    const operation = beginOperation("quick");
    const snapshot = snapshotFromDraft(question, answers, originalInput);
    try {
      const proposalData = await post<{ ok: true; challenges: ChallengeProposal[] }>("/api/challenges", snapshot, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      const selected = proposalData.challenges.find((item) => item.kind === "conflicting_evidence") ?? proposalData.challenges[0];
      setProposals(proposalData.challenges);
      setChallengeKind(selected.kind);
      setChallengeInput(selected.input);
      setBusy("compare");
      await runComparisonWith(selected.input, selected.kind, operation);
    } catch (cause) {
      captureError(cause, "The controlled challenge failed.", operation.requestId);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function saveLabeledCase() {
    if (!comparison || !expectedAnswer || !expectedConfirmed || meaningPreserved == null || comparisonSaved) return;
    const operation = beginOperation("save");
    try {
      const data = await post<{ ok: true; case: PersistedCase }>("/api/cases", {
        nodeId: comparison.nodeId,
        sourceVersionId: comparison.version.id,
        setKind,
        challengeKind: comparison.challengeKind,
        expectedAnswer,
        meaningPreserved,
        challengeIntent: meaningPreserved ? "preserve" : "change",
        originalRunId: comparison.originalRunId,
        challengedRunId: comparison.challengedRunId,
      }, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      setCases((current) => [data.case, ...current.filter((item) => item.id !== data.case.id)]);
      setSavedComparisonKey(comparisonKey);
      setSavedCaseId(data.case.id);
      setSavedCaseSet(data.case.setKind);
    } catch (cause) {
      captureError(cause, "The reviewed case could not be saved.", operation.requestId, false);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function publishCase() {
    if (!savedCaseId || !publishConsent || publishedPath) return;
    const operation = beginOperation("publish");
    try {
      const data = await post<{ ok: true; path: string; expiresAt: string }>("/api/publish", { caseId: savedCaseId, consent: true }, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      setPublishedPath(data.path);
    } catch (cause) {
      captureError(cause, "The share link could not be published.", operation.requestId, false);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function suggestRevision() {
    if (!nodeId || !version) return;
    const operation = beginOperation("suggest");
    try {
      const data = await post<{ ok: true; candidate: { question: string; answers: string[] } }>("/api/revision/suggest", { nodeId, versionId: version.id }, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      setCandidateQuestion(data.candidate.question);
      setCandidateAnswers(data.candidate.answers);
      setCandidateSource("serv");
      setLabelMapping({});
    } catch (cause) {
      captureError(cause, "SERV could not suggest a revision candidate.", operation.requestId, false);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  async function evaluateRevision() {
    if (!nodeId || !version) return;
    const operation = beginOperation("evaluate");
    try {
      const data = await post<EvaluationResult & { ok: true }>("/api/revision/evaluate", {
        nodeId,
        baseVersionId: version.id,
        question: candidateQuestion,
        answers: candidateAnswers,
        candidateSource,
        labelMapping,
      }, operation.controller.signal);
      if (!isResponseCurrent(operation.requestId, latestRequestId.current)) return;
      setEvaluation(data);
    } catch (cause) {
      captureError(cause, "The revision evaluation failed.", operation.requestId, false);
    } finally {
      finishOperation(operation.requestId);
    }
  }

  const fieldsDisabled = !servConfigured || Boolean(busy);
  const oneOffResult = decision ?? { result: SAMPLE, snapshot: INITIAL };
  const isPrefilledExample = sameDecisionSnapshot(draftSnapshot, INITIAL);
  const runStateLabel = runState === "running" ? "LOADING" : runState === "not_tested" ? "NOT TESTED" : runState.toUpperCase();
  const comparisonPending = busy === "quick" || busy === "compare";
  const instrumentState = comparisonPending ? "loading" : runState === "failed" ? "failed" : comparison ? answersChanged ? "changed" : "held" : "sample";
  const instrumentOriginalInput = comparison?.snapshot.originalInput ?? INITIAL.input;
  const instrumentChallengeInput = comparison?.snapshot.challengeInput ?? SAMPLE_CHALLENGE_INPUT;
  const instrumentOriginalResult = comparison?.original ?? SAMPLE;
  const instrumentChallengedResult = comparison?.challenged ?? SAMPLE_CHALLENGED;
  const humanMismatch = expectedConfirmed && reviewStatus === "HUMAN_CONFIRMED_MISMATCH";
  const primaryAction = capabilities.canRunComparison ? runQuickChallenge : testDecision;
  const primaryDisabled = !capabilities.canRunDecision || Boolean(busy) || !originalInput.trim();
  const primaryLabel = comparisonPending
    ? busy === "quick" ? "PREPARING CONTROLLED EDIT…" : "SERV IS RUNNING BOTH INPUTS…"
    : isPrefilledExample
      ? "RUN THIS EXAMPLE LIVE"
      : capabilities.canRunComparison
        ? "RUN A LIVE COMPARISON"
        : "RUN LIVE DECISION";

  return (
    <>
      <main id="main-content" className="chamber-page-main">
        <section className="chamber-hero" id="workbench" aria-labelledby="page-title" aria-busy={Boolean(busy)}>
          <div className="chamber-intro">
            <p className="eyebrow">DECISION CHAMBER</p>
            <h1 id="page-title">Test a bounded decision.</h1>
            <p>Change one fact, compare both SERV answers, then label what should have happened.</p>
          </div>

          <section className={`decision-chamber state-${instrumentState}`} aria-labelledby="instrument-title" aria-live="polite">
            <header className="instrument-header">
              <div>
                <span className={`run-tag ${instrumentState === "sample" ? "tag-sample" : instrumentState === "failed" ? "tag-failed" : comparisonPending ? "tag-loading" : "tag-live"}`}>
                  {instrumentState === "sample" ? "SAMPLE / NO API CALL" : instrumentState === "failed" ? "FAILED" : comparisonPending ? "LOADING" : "LIVE COMPARISON"}
                </span>
                <span>{instrumentState === "failed" ? "Request did not produce a comparison" : comparison ? KIND_LABELS[comparison.challengeKind] : "Illustrative conflicting evidence"}</span>
              </div>
              <p>{instrumentState === "sample" ? "An illustrative preview. Run it to replace every value with measured SERV data." : comparisonPending ? "The right verdict is intentionally blank until SERV returns." : instrumentState === "failed" ? "The latest request failed. Prior results and sample values are not substituted." : comparison ? "Frozen inputs and actual bounded answers from this run." : "No measured comparison is available."}</p>
            </header>

            {instrumentState === "failed" && error ? (
              <div className="instrument-failure" role="alert">
                <span>FAILED</span><div><strong>{error.code.replaceAll("_", " ")}</strong><p>{error.message}</p></div>
              </div>
            ) : (
              <div key={comparisonKey ?? instrumentState}>
                <SplitLens compact state={instrumentState} originalInput={instrumentState === "sample" ? INITIAL.input : comparisonPending ? originalInput : instrumentOriginalInput} challengedInput={instrumentState === "sample" ? SAMPLE_CHALLENGE_INPUT : comparisonPending ? challengeInput : instrumentChallengeInput} originalAnswer={comparisonPending ? "Pending" : instrumentOriginalResult.selectedAnswer} challengedAnswer={comparisonPending ? undefined : instrumentChallengedResult.selectedAnswer} />
                <div className="chamber-grid">
                  <article className="verdict-pane original-pane"><div className="pane-label"><span>ORIGINAL INPUT</span><small>{instrumentState === "sample" ? "SAMPLE" : comparisonPending ? "SUBMITTED" : "MEASURED"}</small></div><p>{instrumentState === "sample" ? INITIAL.input : comparisonPending ? originalInput : instrumentOriginalInput}</p></article>
                  <div className="boundary-seam" aria-label={instrumentState === "changed" ? "The measured answer changed" : instrumentState === "held" ? "The measured answer held" : "Decision boundary preview"}><div className="seam-copy"><DiffView before={instrumentState === "sample" ? INITIAL.input : comparisonPending ? originalInput : instrumentOriginalInput} after={instrumentState === "sample" ? SAMPLE_CHALLENGE_INPUT : comparisonPending ? challengeInput : instrumentChallengeInput} />{instrumentState === "changed" && <strong className="change-signal">ANSWER CHANGED</strong>}{instrumentState === "held" && <strong className="hold-signal">ANSWER HELD</strong>}{instrumentState === "loading" && <strong className="wait-signal">WAITING FOR SERV</strong>}</div></div>
                  <article className="verdict-pane challenged-pane"><div className="pane-label"><span>CHALLENGED INPUT</span><small>{instrumentState === "sample" ? "SAMPLE" : comparisonPending ? "SUBMITTED" : "MEASURED"}</small></div><p>{instrumentState === "sample" ? SAMPLE_CHALLENGE_INPUT : comparisonPending ? challengeInput : instrumentChallengeInput}</p></article>
                </div>
              </div>
            )}

            {humanMismatch && <div className="human-mismatch" role="status"><span aria-hidden="true">!</span> HUMAN-CONFIRMED MISMATCH</div>}

            <section className="jev-strip" aria-label="Jev experiment analysis" aria-live="polite">
              <div className="jev-provenance"><span>JEV ANALYSIS</span><b>{instrumentState === "failed" ? "UNAVAILABLE" : comparison ? jevState.status === "live" ? "LIVE" : jevState.status === "loading" ? "LOADING" : jevState.status === "failed" ? "FAILED" : "UNAVAILABLE" : "SAMPLE PREVIEW"}</b></div>
              {instrumentState === "failed" && <p>Unavailable for the failed request. Prior Jev analysis is not attached to this attempt.</p>}
              {instrumentState !== "failed" && !comparison && <p>Unavailable until a live comparison. Jev analyzes the experiment, never the underlying refund verdict.</p>}
              {instrumentState !== "failed" && comparison && jevState.status === "loading" && <p>Reviewing the observed hold or flip and the apparent relevance of the edit.</p>}
              {instrumentState !== "failed" && comparison && jevState.status === "idle" && <p>Unavailable. No Jev analysis was requested for this comparison.</p>}
              {instrumentState !== "failed" && comparison && jevState.status === "unavailable" && <p>Unavailable. {jevState.reason}</p>}
              {instrumentState !== "failed" && comparison && jevState.status === "failed" && <p><strong>{jevState.code.replaceAll("_", " ")}</strong> {jevState.reason} <button className="inline-action" type="button" onClick={() => void requestJevAnalysis(comparison)}>Retry</button></p>}
              {instrumentState !== "failed" && comparison && jevState.status === "live" && <dl><div><dt>Observed</dt><dd>{jevState.observedBehavior}</dd></div><div><dt>Apparent relevance</dt><dd>{jevState.apparentRelevance.replaceAll("_", " ")}</dd></div><div><dt>Review priority</dt><dd>{jevState.reviewPriority}</dd></div><div><dt>Model</dt><dd>{jevState.model}</dd></div></dl>}
            </section>

            <div className="instrument-actions">
              <div><strong>{isPrefilledExample ? "Replace the sample with a measured run." : "Measure the current decision draft."}</strong><span>{capabilities.canRunComparison ? "SERV will run both inputs. Persistence is healthy." : capabilities.canRunDecision ? "One live SERV decision is available. Comparison needs persistence." : "Live runs require SERV_API_KEY."}</span></div>
              <button className="primary-button" type="button" onClick={primaryAction} disabled={primaryDisabled}>{primaryLabel}<span aria-hidden="true">↗</span></button>
            </div>

            <details className="evidence-drawer">
              <summary><span>Evidence and returned data</span><small>status, latency, provider, raw JSON</small></summary>
              <div className="evidence-grid">
                <StatusItem label="Run status" value={instrumentState === "sample" ? "SAMPLE" : runStateLabel} tone={runState === "failed" ? "error" : comparison ? "good" : "neutral"} />
                <StatusItem label="Challenge" value={instrumentState === "failed" ? "Not run" : comparison ? KIND_LABELS[comparison.challengeKind] : "Illustrative"} />
                <StatusItem label="Original latency" value={instrumentState !== "failed" && comparison ? `${comparison.original.latencyMs.toLocaleString()} ms` : "Not measured"} />
                <StatusItem label="Challenged latency" value={instrumentState !== "failed" && comparison ? `${comparison.challenged.latencyMs.toLocaleString()} ms` : "Not measured"} />
              </div>
              {instrumentState === "failed" ? <p className="sample-disclosure">No verdict, latency, provider response, or Jev analysis is attached to the failed request.</p> : comparison ? <div className="result-pair"><ResultCard label="ORIGINAL SERV RESULT" result={comparison.original} /><ResultCard label="CHALLENGED SERV RESULT" result={comparison.challenged} /></div> : <p className="sample-disclosure">The preview contains illustrative output only. No request ID, latency, provider, or model result is presented as live.</p>}
              {instrumentState !== "failed" && comparison && jevState.status === "live" && <details className="raw-nested"><summary>Actual Jev returned data</summary><pre>{JSON.stringify(jevState.raw, null, 2)}</pre></details>}
            </details>
          </section>

          <details className="system-strip" aria-label="Configuration and service status">
            <summary>Service diagnostics</summary>
            <div>
            <StatusItem label="SERV configuration" value={servConfigured ? "Configured" : "Missing"} tone={servConfigured ? "neutral" : "warning"} />
            <StatusItem label="Workspace configuration" value={databaseConfigured ? "Configured" : "Not configured"} />
            <StatusItem label="Workspace health" value={persistenceHealth === "checking" ? "LOADING" : persistenceHealth.replaceAll("_", " ")} tone={persistenceHealth === "available" ? "good" : persistenceHealth === "failed" ? "error" : "neutral"} />
            <StatusItem label="Jev configuration" value={jevConfigured ? "Configured" : "Unavailable"} tone={jevConfigured ? "neutral" : "warning"} />
            </div>
          </details>
        </section>

        {!servConfigured && <aside className="mode-notice notice-sample" role="status"><strong>SAMPLE MODE / READ ONLY</strong><p>No SERV key is configured. Every result above is illustrative and no API request occurred.</p></aside>}
        {servConfigured && capabilities.mode === "initializing" && <aside className="mode-notice" role="status"><strong>WORKSPACE / LOADING</strong><p>Checking the private anonymous workspace. A one-off live decision is already available.</p></aside>}
        {servConfigured && capabilities.mode === "decision_only" && <aside className="mode-notice" role="status"><strong>ONE-OFF LIVE MODE</strong><p>Real SERV decisions are available. Comparison, saved cases, and revision evaluation require healthy persistence.</p></aside>}
        {workspaceError && <aside className="mode-notice notice-error" role="alert"><strong>{workspaceError.code.replaceAll("_", " ")}</strong><p>{workspaceError.message}</p><button className="secondary-button" type="button" onClick={retryWorkspace}>RETRY WORKSPACE</button></aside>}

        <section className="workbench setup-bench" aria-labelledby="workbench-title">
          <div className="section-heading"><div><p>DECISION SETUP</p><h2 id="workbench-title">Define the boundary</h2></div><small>2 to 5 allowed answers. Replace every field.</small></div>
          <div className="definition-grid">
            <div className="definition-fields">
              <label htmlFor="question">Decision question</label>
              <textarea id="question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={fieldsDisabled} />
              <div className="field-heading"><label>Allowed answers</label><span>{answers.length}/5</span></div>
              <div className="answers-list">
                {answers.map((answer, index) => <div className="answer-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Allowed answer ${index + 1}`} value={answer} onChange={(event) => updateAnswer(index, event.target.value)} disabled={fieldsDisabled} /><button type="button" aria-label={`Remove answer ${answer || index + 1}`} onClick={() => setAnswers((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={fieldsDisabled || answers.length <= 2}>×</button></div>)}
              </div>
              {answers.length < 5 && <button className="text-button" type="button" onClick={() => setAnswers((current) => [...current, ""])} disabled={fieldsDisabled}>+ Add answer</button>}
            </div>
            <div className="input-field">
              <label htmlFor="original">Input to test</label>
              <textarea className="mono" id="original" rows={11} value={originalInput} onChange={(event) => setOriginalInput(event.target.value)} disabled={fieldsDisabled} />
              <p>Public demos should use synthetic text. Submitted input belongs only to this anonymous browser workspace and is never listed publicly.</p>
            </div>
          </div>
          {busyLabel && <div className="operation-status" role="status" aria-live="polite"><i aria-hidden="true" /><span>{busyLabel}</span></div>}
          {error && <div className="operation-error" role="alert"><span>FAILED</span><div><strong>{error.code.replaceAll("_", " ")}</strong><p>{error.message}</p></div></div>}
        </section>

        {decision && !comparison && <section className="decision-result" aria-labelledby="decision-result-title">
          <div className="section-heading dark-heading"><div><p>MEASURED DECISION</p><h2 id="decision-result-title" ref={resultHeadingRef} tabIndex={-1}>Live bounded result</h2></div><b className="run-tag tag-live">LIVE</b></div>
          {decisionDraftChanged && <div className="stale-note"><strong>Draft changed after this run.</strong> The measured result below remains tied to the exact submitted question, answers, and input.</div>}
          {repeatDisagreement && <div className="operation-error repeat-warning" role="alert"><span>DISAGREEMENT</span><div><strong>Repeated identical run changed answer</strong><p>{repeatDisagreement.before} → {repeatDisagreement.after}. Review both actual responses; neither run is silently discarded.</p></div></div>}
          <div className="single-result-grid"><div className="answer-focus"><small>SELECTED ANSWER</small><strong>{oneOffResult.result.selectedAnswer}</strong><p>Validated on the server against the allowed answer set.</p></div><ResultCard label="ACTUAL SERV RESULT" result={oneOffResult.result} /></div>
          {capabilities.canRunComparison && <div className="next-action"><div><span>NEXT ACTION</span><strong>Stress the same boundary with one controlled edit.</strong></div><button className="primary-button" type="button" onClick={runQuickChallenge} disabled={Boolean(busy)}>RUN CONTROLLED CHALLENGE <span aria-hidden="true">↗</span></button></div>}
        </section>}

        <section className="challenge-stage" aria-labelledby="challenge-title">
          <div className="section-heading"><div><p>CONTROLLED CHALLENGE</p><h2 id="challenge-title">Change one thing</h2></div><small>{capabilities.canRunComparison ? "Persistence ready" : "Healthy persistence required"}</small></div>
          <div className="challenge-intro"><p>Ask SERV for five varied inputs, choose one, or write your own. An answer change is a finding for review, not automatically an error.</p><button className="secondary-button" type="button" onClick={generateChallenges} disabled={!capabilities.canGenerateChallenges || Boolean(busy)}>{busy === "propose" ? "GENERATING" : "GENERATE CHALLENGE IDEAS"}</button></div>
          <div className="challenge-types" aria-label="Challenge type guide">
            {(Object.keys(KIND_HELP) as ChallengeKind[]).filter((kind) => kind !== "manual").map((kind) => <div key={kind}><strong>{KIND_LABELS[kind]}</strong><span>{KIND_HELP[kind]}</span></div>)}
          </div>
          <div className="challenge-editor">
            {proposals.length > 0 && <div className="proposal-tabs" role="tablist" aria-label="Generated challenges">{proposals.map((proposal) => <button role="tab" aria-selected={challengeKind === proposal.kind} className={challengeKind === proposal.kind ? "active" : ""} key={proposal.kind} onClick={() => { setChallengeKind(proposal.kind); setChallengeInput(proposal.input); }}><span>{KIND_LABELS[proposal.kind]}</span><small>{proposal.label}</small></button>)}</div>}
            <div className="field-heading"><label htmlFor="challenge-input">Challenged input</label><button className="text-button" type="button" onClick={() => { setChallengeKind("manual"); setChallengeInput(originalInput); }}>Write manually</button></div>
            <textarea className="mono" id="challenge-input" rows={7} value={challengeInput} onChange={(event) => { setChallengeKind("manual"); setChallengeInput(event.target.value); }} disabled={fieldsDisabled} />
            <button className="primary-button compare-button" type="button" onClick={runComparison} disabled={!capabilities.canRunComparison || Boolean(busy) || challengeInput.trim() === originalInput.trim()}>{busy === "compare" ? "RUNNING BOTH INPUTS…" : "RUN THIS COMPARISON"}<span aria-hidden="true">↗</span></button>
          </div>
          {!capabilities.canRunComparison && <div className="locked-row"><strong>Comparison is unavailable.</strong><span>{!servConfigured ? "Configure SERV_API_KEY first." : persistenceHealth === "checking" ? "The private workspace is still loading." : persistenceHealth === "failed" ? "Fix the database connection or schema error shown above." : "Configure DATABASE_URL to persist the two measured runs."}</span></div>}
        </section>

        {comparison && <section className="comparison-stage" aria-labelledby="comparison-title">
          <div className="section-heading dark-heading"><div><p>HUMAN REVIEW</p><h2 id="comparison-title" ref={resultHeadingRef} tabIndex={-1}>What should have happened?</h2></div><b className="run-tag tag-live">LIVE COMPARISON</b></div>
          {comparisonDraftChanged && <div className="stale-note"><strong>Unsaved edits are not part of this result.</strong> The diff, answers, and saved case use the frozen input pair that SERV actually evaluated.</div>}
          <div className="review-block">
            <div className="review-copy"><span>REVIEW STATUS</span><strong>{reviewStatus?.replaceAll("_", " ")}</strong><p>Confirm the expected answer, then say whether the edit was meant to keep or change the correct decision. A flip alone is never called an error.</p></div>
            <div className="review-fields">
              <div className="expected-field"><label htmlFor="expected">Suggested expected answer</label><select id="expected" value={expectedAnswer} onChange={(event) => { setExpectedAnswer(event.target.value); setExpectedConfirmed(false); }}><option value="">Choose explicitly</option>{comparison.snapshot.answers.map((answer) => <option key={answer}>{answer}</option>)}</select><button className={`confirm-button ${expectedConfirmed ? "confirmed" : ""}`} type="button" aria-pressed={expectedConfirmed} onClick={() => setExpectedConfirmed(true)} disabled={!expectedAnswer}>{expectedConfirmed ? "EXPECTED ANSWER CONFIRMED" : "CONFIRM EXPECTED ANSWER"}</button></div>
              <fieldset><legend>What was this edit intended to do?</legend><div className="segmented"><button type="button" aria-pressed={meaningPreserved === true} className={meaningPreserved === true ? "active" : ""} onClick={() => setMeaningPreserved(true)}>Preserve decision</button><button type="button" aria-pressed={meaningPreserved === false} className={meaningPreserved === false ? "active" : ""} onClick={() => setMeaningPreserved(false)}>Change decision</button></div></fieldset>
              <div><label htmlFor="case-set">Test set</label><select id="case-set" value={setKind} onChange={(event) => setSetKind(event.target.value as "labeled" | "held_out")}><option value="labeled">Labeled / can guide revisions</option><option value="held_out">Held-out / evaluation only</option></select></div>
              <button className="save-button" type="button" onClick={saveLabeledCase} disabled={!expectedAnswer || !expectedConfirmed || meaningPreserved == null || Boolean(busy) || comparisonSaved}>{comparisonSaved ? "CASE SAVED" : busy === "save" ? "SAVING" : "SAVE REVIEWED CASE"}</button>
              {comparisonSaved && savedCaseSet === "held_out" && <div className="publish-control"><strong>HELD-OUT / PRIVATE</strong><p>Held-out cases cannot be published. They remain available only to this anonymous workspace for revision evaluation.</p></div>}
              {comparisonSaved && savedCaseSet === "labeled" && <div className="publish-control"><details><summary>Preview what becomes public</summary><div className="publish-preview"><p><strong>Question:</strong> {comparison.snapshot.question}</p><p><strong>Allowed answers:</strong> {comparison.snapshot.answers.join(" · ")}</p><p><strong>Original input:</strong> {comparison.snapshot.originalInput}</p><p><strong>Changed input:</strong> {comparison.snapshot.challengeInput}</p><p><strong>Recorded answers:</strong> {comparison.original.selectedAnswer} → {comparison.challenged.selectedAnswer}</p><p><strong>Models:</strong> {comparison.original.model} / {comparison.challenged.model}</p><p><strong>Providers:</strong> {comparison.original.provider ?? "not returned"} / {comparison.challenged.provider ?? "not returned"}</p><p><strong>Human label:</strong> Expected {expectedAnswer}; intent {meaningPreserved ? "preserve" : "change"}.</p><p><strong>Jev:</strong> {jevState.status === "live" ? `${jevState.observedBehavior}, ${jevState.apparentRelevance.replaceAll("_", " ")}, ${jevState.reviewPriority}` : "Unavailable"}</p><p>Recorded timestamps are included. Raw provider JSON and workspace ownership are excluded. The link expires in 30 days.</p></div></details><label><input type="checkbox" checked={publishConsent} onChange={(event) => setPublishConsent(event.target.checked)} disabled={Boolean(publishedPath)} /><span>I reviewed this synthetic or consented case and choose to make the previewed data public for 30 days.</span></label>{publishedPath ? <a href={publishedPath}>Open published result ↗</a> : <button type="button" className="text-button" onClick={publishCase} disabled={!publishConsent || busy === "publish"}>{busy === "publish" ? "Publishing…" : "Publish this case"}</button>}</div>}
            </div>
          </div>
        </section>}

        <section className="cases-stage" id="cases" aria-labelledby="cases-title">
          <div className="section-heading"><div><p>CASE SHELF</p><h2 id="cases-title">Saved evidence</h2></div><small>{cases.length} private {cases.length === 1 ? "case" : "cases"}. Evaluation uses the first 12.</small></div>
          {cases.length ? <div className="case-shelf" aria-label="Saved decision cases">{cases.map((item) => <article className="case-row" key={item.id}><header><b className="set-label">{item.setKind.replace("_", " ")}</b><span>{KIND_LABELS[item.challengeKind]}</span></header><div className="case-answer-pair"><strong>{item.originalAnswer}</strong><span aria-hidden="true">→</span><strong>{item.challengedAnswer}</strong></div><dl><div><dt>Expected</dt><dd>{item.expectedAnswer}</dd></div><div><dt>Intent</dt><dd>{item.challengeIntent ?? (item.meaningPreserved ? "preserve" : "legacy")}</dd></div></dl><b className={`verdict verdict-${item.status.toLowerCase().replaceAll("_", "-")}`}>{item.status.replaceAll("_", " ")}</b></article>)}</div> : <div className="empty-state"><strong>No reviewed cases yet.</strong><span>Run a comparison, label it, and save the first reproducible case.</span></div>}
          <p className="privacy-note">Held-out cases are never included in SERV revision prompts. They are used only when evaluating a candidate.</p>
        </section>

        <section className="revision-stage" id="revision" aria-labelledby="revision-title">
          <div className="section-heading"><div><p>REVISION BENCH</p><h2 id="revision-title">Test the next version</h2></div><button className="secondary-button" type="button" onClick={suggestRevision} disabled={!capabilities.canEvaluateRevisions || Boolean(busy) || !cases.some((item) => item.setKind === "labeled" && (item.challengeIntent || item.meaningPreserved))}>{busy === "suggest" ? "SUGGESTING…" : "ASK SERV FOR A CANDIDATE"}</button></div>
          <p className="revision-note">A SERV suggestion is only a candidate. Choiceproof reruns the first 12 saved cases, including the held-out set, and shows every measured regression.</p>
          <div className="version-comparison">
            <article><header><span>BASELINE</span><b>V{version?.versionNumber ?? 1}</b></header><p>{version?.question ?? question}</p><ul>{(version?.answers ?? answers).map((answer) => <li key={answer}>{answer}</li>)}</ul></article>
            <div className="version-divider" aria-hidden="true">→</div>
            <article className="candidate-version"><header><span>{candidateSource === "serv" ? "SERV CANDIDATE" : "EDITED CANDIDATE"}</span><b>V{evaluation?.candidateVersion.versionNumber ?? (version?.versionNumber ?? 1) + 1}</b></header><label htmlFor="candidate-question">Candidate question</label><textarea id="candidate-question" rows={4} value={candidateQuestion} onChange={(event) => { setCandidateSource("user"); setCandidateQuestion(event.target.value); }} disabled={!capabilities.canEvaluateRevisions} /><label>Candidate answers</label><div className="answers-list">{candidateAnswers.map((answer, index) => <div className="answer-row" key={index}><span>{String(index + 1).padStart(2, "0")}</span><input aria-label={`Candidate answer ${index + 1}`} value={answer} onChange={(event) => { setCandidateSource("user"); setCandidateAnswers((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item)); }} disabled={!capabilities.canEvaluateRevisions} /><button type="button" aria-label={`Remove candidate answer ${answer || index + 1}`} disabled={!capabilities.canEvaluateRevisions || candidateAnswers.length <= 2} onClick={() => setCandidateAnswers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>{candidateAnswers.length < 5 && <button className="text-button" type="button" onClick={() => setCandidateAnswers((current) => [...current, ""])} disabled={!capabilities.canEvaluateRevisions}>+ Add candidate answer</button>}</article>
          </div>
          {removedAnswers.length > 0 && <div className="mapping-panel"><h3>Explicit label mapping required</h3><p>Cases using a removed answer remain <strong>NEEDS RELABELING</strong> until you map it.</p>{removedAnswers.map((oldAnswer) => <label key={oldAnswer}><span>{oldAnswer}</span><select aria-label={`Map removed label ${oldAnswer}`} value={labelMapping[oldAnswer] ?? ""} onChange={(event) => setLabelMapping((current) => ({ ...current, [oldAnswer]: event.target.value || null }))}><option value="">Needs relabeling</option>{candidateAnswers.filter(Boolean).map((answer) => <option key={answer}>{answer}</option>)}</select></label>)}</div>}
          <button className="primary-button evaluate-button" type="button" onClick={evaluateRevision} disabled={!capabilities.canEvaluateRevisions || Boolean(busy) || cases.length === 0}>{busy === "evaluate" ? "RERUNNING FIRST 12 CASES…" : "RERUN FIRST 12 CASES"}<span aria-hidden="true">↗</span></button>
          {evaluation && <div className="evaluation-report"><div className={`evaluation-summary ${evaluation.summary.regressions ? "has-regression" : "no-regression"}`}><span>MEASURED RESULT / VERSION {evaluation.candidateVersion.versionNumber}</span><strong>{evaluation.summary.regressions ? `${evaluation.summary.regressions} REGRESSION${evaluation.summary.regressions === 1 ? "" : "S"} DETECTED` : "NO REGRESSIONS IN THE EVALUATED CASES"}</strong><p>{evaluation.summary.evaluated} evaluated. {evaluation.summary.needsRelabeling} need relabeling. {evaluation.summary.notComparable} not comparable. Passing these cases is not a universal safety guarantee.</p></div><div className="evaluation-groups">{(["labeled", "held_out"] as const).map((kind) => <section key={kind}><h3>{kind === "labeled" ? "Labeled cases" : "Held-out cases"}</h3>{evaluation.results.filter((item) => item.setKind === kind).map((item) => <article className={`evaluation-row verdict-${item.verdict?.toLowerCase() ?? "relabel"}`} key={item.caseId}><span>{item.status === "NEEDS_RELABELING" ? "NEEDS RELABELING" : item.status === "NOT_COMPARABLE" ? "NOT COMPARABLE / SKIPPED" : item.verdict?.replaceAll("_", " ")}</span>{item.status === "EVALUATED" && <strong>{item.baselineAnswer} → {item.candidateAnswer}<small>expected {item.expectedAnswer}</small></strong>}</article>)}</section>)}</div></div>}
        </section>

      </main>
    </>
  );
}
