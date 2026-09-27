"use client";

import { useState } from "react";
import type { DecisionSuccess } from "@/lib/contracts";
import type { PublicComparison } from "@/lib/public-evidence";
import { ComparisonPlate } from "@/components/comparison-plate";
import { ArrowUpRightIcon } from "@/components/icons";

type RerunState = { kind: "idle" | "loading" } | { kind: "failed"; code: string; message: string } | { kind: "live"; original: DecisionSuccess; challenged: DecisionSuccess };

async function decide(payload: PublicComparison, input: string) {
  const response = await fetch("/api/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: payload.question, answers: payload.answers, input }) });
  const data = await response.json().catch(() => null) as (DecisionSuccess & { error?: { code?: string; message?: string } }) | null;
  if (!response.ok || !data?.ok) throw new Error(`${data?.error?.code ?? `HTTP_${response.status}`}|${data?.error?.message ?? "The rerun failed."}`);
  return data;
}

export function PublicRerun({ payload }: { payload: PublicComparison }) {
  const [state, setState] = useState<RerunState>({ kind: "idle" });
  async function rerun() {
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const [original, challenged] = await Promise.all([decide(payload, payload.originalInput), decide(payload, payload.challengeInput)]);
      setState({ kind: "live", original, challenged });
    } catch (error) {
      const [code, message] = (error instanceof Error ? error.message : "RERUN_FAILED|The rerun failed.").split("|", 2);
      setState({ kind: "failed", code, message });
    }
  }
  return <section className="public-rerun" aria-live="polite" aria-busy={state.kind === "loading"}>
    <header><div><p className="eyebrow">REPRODUCE</p><h2>Rerun these exact inputs</h2></div><p>Fresh SERV outputs appear separately. The recorded evidence above is never overwritten.</p></header>
    {state.kind === "live" && <ComparisonPlate label="LIVE" question={payload.question} answers={payload.answers} originalInput={payload.originalInput} challengeInput={payload.challengeInput} originalAnswer={state.original.selectedAnswer} challengedAnswer={state.challenged.selectedAnswer} models={{ original: state.original.model, challenged: state.challenged.model }} challengeKind={payload.challengeKind} />}
    {state.kind === "failed" && <div className="live-state state-failed" role="alert"><span>FAILED</span><strong>{state.code.replaceAll("_", " ")}</strong><p>{state.message}</p></div>}
    <button className="primary-button" type="button" onClick={rerun} disabled={state.kind === "loading"}>{state.kind === "loading" ? "RUNNING TWO REQUESTS…" : "Rerun these inputs"}<ArrowUpRightIcon /></button>
  </section>;
}
