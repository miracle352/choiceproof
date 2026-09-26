import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { validateDecisionRequest } from "@/lib/contracts";
import { ensureNodeVersion, getOwnedVersionAndCases, saveRun } from "@/lib/db";
import { compareVersionOutcome, mapExpectedLabel, revisionCaseDisposition, type LabelMapping } from "@/lib/domain";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";
import { runServDecision } from "@/lib/serv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  const body = await readJson(request);
  if (!body.ok) return attachOwnerCookie(body.response, owner);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Request body must be an object." } }, { status: 400 }), owner);
  }
  const value = body.value as Record<string, unknown>;
  if (typeof value.nodeId !== "string" || typeof value.baseVersionId !== "string") {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "A saved base version is required." } }, { status: 400 }), owner);
  }
  const candidate = validateDecisionRequest({ question: value.question, answers: value.answers, input: "candidate" });
  if (!candidate.success) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: candidate.message } }, { status: 400 }), owner);
  }
  const mapping = value.labelMapping && typeof value.labelMapping === "object" && !Array.isArray(value.labelMapping)
    ? value.labelMapping as LabelMapping
    : {};

  try {
    const stored = await getOwnedVersionAndCases(owner.hash, value.nodeId, value.baseVersionId);
    if (!stored.cases.length) {
      return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "NO_CASES", message: "Save labeled or held-out cases before evaluating a revision." } }, { status: 400 }), owner);
    }
    const candidateStored = await ensureNodeVersion({
      ownerHash: owner.hash,
      nodeId: value.nodeId,
      decision: candidate.data,
      candidateSource: value.candidateSource === "serv" ? "serv" : "user",
      labelMapping: mapping,
    });

    const results: Array<Record<string, unknown>> = [];
    for (const testCase of stored.cases.slice(0, 12)) {
      if (revisionCaseDisposition(testCase.meaningPreserved) === "NOT_COMPARABLE") {
        results.push({
          caseId: testCase.id,
          setKind: testCase.setKind,
          status: "NOT_COMPARABLE",
          expectedAnswer: testCase.expectedAnswer,
        });
        continue;
      }
      const migrated = mapExpectedLabel({
        expectedAnswer: testCase.expectedAnswer,
        oldAnswers: stored.version.answers,
        newAnswers: candidate.data.answers,
        mapping,
      });
      if (migrated.status === "NEEDS_RELABELING") {
        results.push({
          caseId: testCase.id,
          setKind: testCase.setKind,
          status: "NEEDS_RELABELING",
          expectedAnswer: testCase.expectedAnswer,
        });
        continue;
      }

      const [baseline, revised] = await Promise.all([
        runServDecision({ question: stored.version.question, answers: stored.version.answers, input: testCase.challengeInput }),
        runServDecision({ question: candidate.data.question, answers: candidate.data.answers, input: testCase.challengeInput }),
      ]);
      await Promise.all([
        saveRun({ nodeId: value.nodeId, versionId: stored.version.id, caseId: testCase.id, runKind: "evaluation_baseline", sourceInput: testCase.challengeInput, result: baseline }),
        saveRun({ nodeId: value.nodeId, versionId: candidateStored.version.id, caseId: testCase.id, runKind: "evaluation_candidate", sourceInput: testCase.challengeInput, result: revised }),
      ]);
      results.push({
        caseId: testCase.id,
        setKind: testCase.setKind,
        status: "EVALUATED",
        ...compareVersionOutcome({
          baselineAnswer: baseline.selectedAnswer,
          candidateAnswer: revised.selectedAnswer,
          expectedAnswer: migrated.answer,
        }),
        baselineRaw: baseline.raw,
        candidateRaw: revised.raw,
      });
    }
    const regressions = results.filter((item) => item.verdict === "REGRESSION").length;
    const needsRelabeling = results.filter((item) => item.status === "NEEDS_RELABELING").length;
    const notComparable = results.filter((item) => item.status === "NOT_COMPARABLE").length;
    return attachOwnerCookie(NextResponse.json({
      ok: true,
      candidateVersion: candidateStored.version,
      results,
      summary: { regressions, needsRelabeling, notComparable, evaluated: results.length - needsRelabeling - notComparable },
    }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
