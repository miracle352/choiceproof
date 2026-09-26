import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { CHALLENGE_KINDS, validateDecisionRequest, type ChallengeKind } from "@/lib/contracts";
import { ensureNodeVersion, isPersistenceConfigured, saveRun } from "@/lib/db";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";
import { runServDecision } from "@/lib/serv";
import { enforceRunBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Request body must be an object." } }, { status: 400 });
  }
  const value = body.value as Record<string, unknown>;
  const original = validateDecisionRequest({ question: value.question, answers: value.answers, input: value.originalInput });
  const challenged = validateDecisionRequest({ question: value.question, answers: value.answers, input: value.challengeInput });
  if (!original.success || !challenged.success) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: !original.success ? original.message : challenged.success ? "Invalid challenge." : challenged.message } }, { status: 400 });
  }
  const kind = typeof value.challengeKind === "string" && (value.challengeKind === "manual" || CHALLENGE_KINDS.includes(value.challengeKind as never))
    ? value.challengeKind as ChallengeKind
    : "manual";
  if (!isPersistenceConfigured()) return apiError(new Error("DATABASE_NOT_CONFIGURED"));

  const owner = getOwnerIdentity(request);
  try {
    await enforceRunBudget(request, owner.hash, 2);
    const nodeId = typeof value.nodeId === "string" ? value.nodeId : null;
    const persisted = await ensureNodeVersion({ ownerHash: owner.hash, nodeId, decision: original.data });
    const [originalResult, challengedResult] = await Promise.all([
      runServDecision(original.data),
      runServDecision(challenged.data),
    ]);
    const [originalRunId, challengedRunId] = await Promise.all([
      saveRun({ nodeId: persisted.nodeId, versionId: persisted.version.id, runKind: "original", sourceInput: original.data.input, result: originalResult }),
      saveRun({ nodeId: persisted.nodeId, versionId: persisted.version.id, runKind: kind, sourceInput: challenged.data.input, result: challengedResult }),
    ]);
    return attachOwnerCookie(NextResponse.json({
      ok: true,
      nodeId: persisted.nodeId,
      version: persisted.version,
      original: originalResult,
      challenged: challengedResult,
      originalRunId,
      challengedRunId,
      challengeKind: kind,
      snapshot: {
        question: original.data.question,
        answers: original.data.answers,
        originalInput: original.data.input,
        challengeInput: challenged.data.input,
      },
    }, { headers: { "Cache-Control": "no-store" } }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
