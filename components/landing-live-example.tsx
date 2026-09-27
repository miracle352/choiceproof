"use client";

import { useRef, useState } from "react";
import type { DecisionSuccess } from "@/lib/contracts";
import { REFUND_CHALLENGE, REFUND_EXAMPLE } from "@/lib/example";
import { ComparisonPlate } from "@/components/comparison-plate";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "failed"; code: string; message: string } | { kind: "live"; original: DecisionSuccess; challenged: DecisionSuccess };

async function run(input: string, signal: AbortSignal) {
  const response = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...REFUND_EXAMPLE, input }),
    signal,
  });
  const data = await response.json().catch(() => null) as (DecisionSuccess & { error?: { code?: string; message?: string } }) | null;
  if (!response.ok || !data?.ok) throw new Error(`${data?.error?.code ?? `HTTP_${response.status}`}|${data?.error?.message ?? "SERV did not return a decision."}`);
  return data;
}

export function LandingLiveExample({ servConfigured }: { servConfigured: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const sequence = useRef(0);

  async function runLive() {
    const requestId = ++sequence.current;
    const controller = new AbortController();
    setState({ kind: "loading" });
    try {
      const [original, challenged] = await Promise.all([run(REFUND_EXAMPLE.input, controller.signal), run(REFUND_CHALLENGE, controller.signal)]);
      if (requestId === sequence.current) setState({ kind: "live", original, challenged });
    } catch (error) {
      if (requestId !== sequence.current) return;
      const [code, message] = (error instanceof Error ? error.message : "LIVE_RUN_FAILED|The live comparison failed.").split("|", 2);
      setState({ kind: "failed", code, message });
    }
  }

  return (
    <section className="landing-live" aria-live="polite" aria-busy={state.kind === "loading"}>
      {state.kind === "live" && <ComparisonPlate label="LIVE" question={REFUND_EXAMPLE.question} answers={REFUND_EXAMPLE.answers} originalInput={REFUND_EXAMPLE.input} challengeInput={REFUND_CHALLENGE} originalAnswer={state.original.selectedAnswer} challengedAnswer={state.challenged.selectedAnswer} models={{ original: state.original.model, challenged: state.challenged.model }} challengeKind="one controlled fact" />}
      {state.kind === "loading" && <div className="live-state state-loading"><span>LOADING</span><strong>SERV is deciding on both inputs.</strong><p>No result is animated or assumed while the provider is pending.</p></div>}
      {state.kind === "failed" && <div className="live-state state-failed" role="alert"><span>FAILED</span><strong>{state.code.replaceAll("_", " ")}</strong><p>{state.message}</p></div>}
      <div className="landing-live-action">
        <div><strong>{state.kind === "live" ? "Fresh results are shown separately above." : "Want a fresh measurement?"}</strong><span>Two new SERV requests. Existing recorded evidence is never overwritten.</span></div>
        <button className="primary-button" type="button" onClick={runLive} disabled={!servConfigured || state.kind === "loading"}>{state.kind === "loading" ? "RUNNING" : "Run it live"}<span aria-hidden="true">↗</span></button>
      </div>
      {!servConfigured && <p className="sample-disclosure">Live runs are unavailable because SERV_API_KEY is not configured. The SAMPLE above remains illustrative.</p>}
    </section>
  );
}
