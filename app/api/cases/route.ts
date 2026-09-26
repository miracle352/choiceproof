import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { getOwnedMeasuredComparison, saveCase } from "@/lib/db";
import { buildReviewedCase, isExpectedLabelValid, type CaseSet } from "@/lib/domain";
import { CHALLENGE_KINDS, type ChallengeKind } from "@/lib/contracts";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  const body = await readJson(request);
  if (!body.ok) return attachOwnerCookie(body.response, owner);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Request body must be an object." } }, { status: 400 }), owner);
  }
  const value = body.value as Record<string, unknown>;
  const requiredStrings = ["nodeId", "sourceVersionId", "expectedAnswer", "originalRunId", "challengedRunId"];
  if (requiredStrings.some((key) => typeof value[key] !== "string" || !(value[key] as string).trim())) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Case labels and run identifiers are required." } }, { status: 400 }), owner);
  }
  if (typeof value.meaningPreserved !== "boolean") {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Meaning-preserved must be explicitly marked." } }, { status: 400 }), owner);
  }
  if (value.challengeIntent !== "preserve" && value.challengeIntent !== "change") {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Challenge intent must be explicitly marked as preserve or change." } }, { status: 400 }), owner);
  }
  const setKind: CaseSet = value.setKind === "held_out" ? "held_out" : "labeled";
  const challengeKind: ChallengeKind = typeof value.challengeKind === "string" && (value.challengeKind === "manual" || CHALLENGE_KINDS.includes(value.challengeKind as never)) ? value.challengeKind as ChallengeKind : "manual";

  try {
    const measured = await getOwnedMeasuredComparison({
      ownerHash: owner.hash,
      nodeId: value.nodeId as string,
      versionId: value.sourceVersionId as string,
      originalRunId: value.originalRunId as string,
      challengedRunId: value.challengedRunId as string,
    });
    if (!isExpectedLabelValid(measured.answers, value.expectedAnswer as string)) {
      return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_LABEL", message: "Expected answer must be one of this version's allowed answers." } }, { status: 400 }), owner);
    }
    const reviewed = buildReviewedCase({
      measured,
      expectedAnswer: value.expectedAnswer as string,
      meaningPreserved: value.meaningPreserved,
      challengeIntent: value.challengeIntent,
    });
    const saved = await saveCase({
      ownerHash: owner.hash,
      nodeId: value.nodeId as string,
      sourceVersionId: value.sourceVersionId as string,
      setKind,
      challengeKind,
      originalInput: reviewed.originalInput,
      challengeInput: reviewed.challengeInput,
      originalAnswer: reviewed.originalAnswer,
      challengedAnswer: reviewed.challengedAnswer,
      expectedAnswer: reviewed.expectedAnswer,
      meaningPreserved: reviewed.meaningPreserved,
      challengeIntent: value.challengeIntent,
      status: reviewed.status,
      originalRunId: value.originalRunId as string,
      challengedRunId: value.challengedRunId as string,
    });
    return attachOwnerCookie(NextResponse.json({ ok: true, case: saved }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
