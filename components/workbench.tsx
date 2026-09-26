"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { DecisionRequest, DecisionResponse, DecisionSuccess } from "@/lib/contracts";

type WorkbenchProps = { liveConfigured: boolean };
type RunRecord = DecisionSuccess & { input: string; completedAt: string };

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const INITIAL_REQUEST: DecisionRequest = {
  question: "Should this refund request be approved, escalated, or declined?",
  answers: ["Approve", "Escalate", "Decline"],
  input:
    "Order #1842 arrived 12 days late. The customer contacted support twice before delivery, the package is unopened, and the request was submitted 4 days after arrival. Policy allows returns within 30 days.",
};

const SAMPLE_RESULT: RunRecord = {
  ok: true,
  selectedAnswer: "Approve",
  model: "gpt-5.4-mini",
  provider: null,
  gateway: "OpenServ SERV Reasoning",
  latencyMs: 842,
  requestId: "sample_not_a_live_request",
  finishReason: "tool_calls",
  input: INITIAL_REQUEST.input,
  completedAt: "Sample only",
  raw: {
    id: "sample_not_a_live_request",
    object: "chat.completion",
    model: "gpt-5.4-mini",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: {
                name: "submit_decision",
                arguments: "{\"answer\":\"Approve\"}",
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  },
};

function runLabel(index: number) {
  return `RUN ${String(index + 1).padStart(2, "0")}`;
}

export function Workbench({ liveConfigured }: WorkbenchProps) {
  const [question, setQuestion] = useState(INITIAL_REQUEST.question);
  const [answers, setAnswers] = useState(INITIAL_REQUEST.answers);
  const [input, setInput] = useState(INITIAL_REQUEST.input);
  const [runs, setRuns] = useState<RunRecord[]>(liveConfigured ? [] : [SAMPLE_RESULT]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = runs.at(-1) ?? null;
  const comparison = runs.length >= 2 ? runs.slice(-2) : null;

  const requestPayload = useMemo(
    () => ({ question: question.trim(), answers: answers.map((item) => item.trim()), input: input.trim() }),
    [question, answers, input],
  );

  const executeDecision = useCallback(async (payload: DecisionRequest) => {
    if (!liveConfigured) {
      throw new Error("Live runs require SERV_API_KEY on the server.");
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as DecisionResponse;
      if (!data.ok) throw new Error(data.error.message);

      const record: RunRecord = {
        ...data,
        input: payload.input,
        completedAt: new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      };
      setRuns((current) => [...current.slice(-9), record]);
      return {
        selectedAnswer: record.selectedAnswer,
        model: record.model,
        provider: record.provider,
        latencyMs: record.latencyMs,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The run failed.";
      setError(message);
      throw cause;
    } finally {
      setPending(false);
    }
  }, [liveConfigured]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await executeDecision(requestPayload);
    } catch {
      // The visible error state is set in executeDecision.
    }
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!liveConfigured || !context?.registerTool) return;

    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "run_bounded_decision",
            title: "Run bounded decision",
            description:
              "Run a live SERV Reasoning decision using one question, 2–5 allowed answers, and an input sample. Updates the visible workbench.",
            inputSchema: {
              type: "object",
              properties: {
                question: { type: "string", minLength: 8, maxLength: 1200 },
                answers: {
                  type: "array",
                  minItems: 2,
                  maxItems: 5,
                  items: { type: "string", minLength: 1, maxLength: 120 },
                },
                input: { type: "string", minLength: 1, maxLength: 12000 },
              },
              required: ["question", "answers", "input"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(value) {
              if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("Input must be an object.");
              }
              const candidate = value as Partial<DecisionRequest>;
              if (
                typeof candidate.question !== "string" ||
                typeof candidate.input !== "string" ||
                !Array.isArray(candidate.answers) ||
                candidate.answers.some((answer) => typeof answer !== "string")
              ) {
                throw new Error("Question, answers, and input are required.");
              }
              const payload = candidate as DecisionRequest;
              setQuestion(payload.question);
              setAnswers(payload.answers);
              setInput(payload.input);
              return executeDecision(payload);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // WebMCP support is optional and feature-detected.
    }
    return () => lifecycle.abort();
  }, [executeDecision, liveConfigured]);

  function updateAnswer(index: number, value: string) {
    setAnswers((current) => current.map((answer, answerIndex) => (answerIndex === index ? value : answer)));
  }

  function removeAnswer(index: number) {
    if (answers.length <= 2) return;
    setAnswers((current) => current.filter((_, answerIndex) => answerIndex !== index));
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#workbench" aria-label="Choiceproof home">
          <span className="brand-mark" aria-hidden="true">CP</span>
          <span>CHOICEPROOF</span>
        </a>
        <div className="mode-cluster" aria-label="Connection status">
          <span className={`status-dot ${liveConfigured ? "is-live" : "is-sample"}`} />
          <span>{liveConfigured ? "SERV LIVE" : "SAMPLE MODE"}</span>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">BOUNDED DECISION WORKBENCH</p>
          <h1 id="page-title">Decisions you can rerun.<br />Boundaries you can inspect.</h1>
        </div>
        <p className="intro-copy">
          Give SERV Reasoning a question, a closed answer set, and one real input. Change the evidence,
          run it again, and see exactly what changed.
        </p>
      </section>

      {!liveConfigured && (
        <aside className="sample-banner" role="status">
          <strong>Read-only sample — not a live run.</strong>
          <span>Add <code>SERV_API_KEY</code> on the server to enable editing and live decisions.</span>
        </aside>
      )}

      <section className="workbench" id="workbench" aria-label="Decision workbench">
        <form className="setup-panel" onSubmit={handleSubmit}>
          <div className="panel-heading">
            <div>
              <span className="step-number">01</span>
              <h2>Define the boundary</h2>
            </div>
            <span className="field-count">{answers.length}/5 ANSWERS</span>
          </div>

          <label className="field-label" htmlFor="question">Decision question</label>
          <textarea
            id="question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={1200}
            disabled={!liveConfigured || pending}
            required
          />

          <fieldset disabled={!liveConfigured || pending}>
            <legend className="field-label">Allowed answers</legend>
            <div className="answers-list">
              {answers.map((answer, index) => (
                <div className="answer-row" key={index}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <input
                    aria-label={`Allowed answer ${index + 1}`}
                    value={answer}
                    onChange={(event) => updateAnswer(index, event.target.value)}
                    maxLength={120}
                    required
                  />
                  <button
                    type="button"
                    className="remove-answer"
                    onClick={() => removeAnswer(index)}
                    disabled={answers.length <= 2}
                    aria-label={`Remove ${answer || `answer ${index + 1}`}`}
                  >×</button>
                </div>
              ))}
            </div>
            {answers.length < 5 && (
              <button type="button" className="add-answer" onClick={() => setAnswers((current) => [...current, ""])}>
                + Add allowed answer
              </button>
            )}
          </fieldset>

          <label className="field-label" htmlFor="sample-input">Sample input</label>
          <textarea
            id="sample-input"
            className="sample-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={7}
            maxLength={12000}
            disabled={!liveConfigured || pending}
            required
          />

          <button className="run-button" type="submit" disabled={!liveConfigured || pending}>
            <span>{pending ? "RUNNING WITH SERV…" : "RUN DECISION"}</span>
            <span aria-hidden="true">↗</span>
          </button>
          {error && <p className="error-message" role="alert">{error}</p>}
        </form>

        <section className="result-panel" aria-live="polite" aria-busy={pending}>
          <div className="panel-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Inspect the result</h2>
            </div>
            {latest && <span className="run-id">{liveConfigured ? runLabel(runs.length - 1) : "SAMPLE"}</span>}
          </div>

          {!latest ? (
            <div className="empty-result">
              <span aria-hidden="true">◇</span>
              <p>Your first live decision will appear here.</p>
            </div>
          ) : (
            <>
              <div className="verdict-block">
                <span className="field-label">Selected answer</span>
                <strong>{latest.selectedAnswer}</strong>
                <span className="verified-label">VALIDATED AGAINST {answers.length} ALLOWED ANSWERS</span>
              </div>

              <dl className="metrics-grid">
                <div><dt>MODEL</dt><dd>{latest.model}</dd></div>
                <div><dt>LATENCY</dt><dd>{latest.latencyMs.toLocaleString()} ms</dd></div>
                <div><dt>GATEWAY</dt><dd>{latest.gateway}</dd></div>
                <div><dt>UPSTREAM PROVIDER</dt><dd>{latest.provider ?? "Not returned by API"}</dd></div>
              </dl>

              <details className="raw-response">
                <summary>Actual returned data <span>JSON</span></summary>
                <pre>{JSON.stringify(latest.raw, null, 2)}</pre>
              </details>
            </>
          )}
        </section>
      </section>

      <section className="compare-section" aria-labelledby="compare-title">
        <div className="compare-heading">
          <div>
            <span className="step-number">03</span>
            <h2 id="compare-title">Compare two runs</h2>
          </div>
          <p>{comparison ? "The latest two inputs and their bounded outcomes." : "Run once, edit the input, then run again."}</p>
        </div>

        {comparison ? (
          <div className="comparison-grid">
            {comparison.map((run, index) => (
              <article key={`${run.requestId}-${index}`}>
                <div className="comparison-meta">
                  <span>{index === 0 ? "BEFORE" : "AFTER"}</span>
                  <span>{run.completedAt}</span>
                </div>
                <p>{run.input}</p>
                <strong>{run.selectedAnswer}</strong>
              </article>
            ))}
            <div className={`change-callout ${comparison[0].selectedAnswer !== comparison[1].selectedAnswer ? "did-change" : "no-change"}`}>
              <span>OUTCOME</span>
              <strong>
                {comparison[0].selectedAnswer === comparison[1].selectedAnswer
                  ? "Answer held"
                  : `${comparison[0].selectedAnswer} → ${comparison[1].selectedAnswer}`}
              </strong>
            </div>
          </div>
        ) : (
          <div className="comparison-empty">
            <span>01</span><i /><span>02</span>
          </div>
        )}
      </section>

      <footer>
        <span>CHOICEPROOF / OPEN TRACK 2026</span>
        <span>BUILT ON SERV REASONING V2</span>
      </footer>
    </main>
  );
}
