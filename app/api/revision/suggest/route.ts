import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { getOwnedVersionAndCases } from "@/lib/db";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";
import { suggestServRevision } from "@/lib/serv";
import { enforceRunBudget } from "@/lib/rate-limit";
import { casesForRevisionPrompt } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  const body = await readJson(request);
  if (!body.ok) return attachOwnerCookie(body.response, owner);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "Request body must be an object." } }, { status: 400 }), owner);
  }
  const { nodeId, versionId } = body.value as { nodeId?: unknown; versionId?: unknown };
  if (typeof nodeId !== "string" || typeof versionId !== "string") {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "A saved decision version is required." } }, { status: 400 }), owner);
  }
  try {
    await enforceRunBudget(request, owner.hash, 1);
    const stored = await getOwnedVersionAndCases(owner.hash, nodeId, versionId);
    const labeled = casesForRevisionPrompt(stored.cases);
    if (!labeled.length) {
      return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "NO_LABELED_CASES", message: "Save at least one explicitly labeled case first." } }, { status: 400 }), owner);
    }
    const candidate = await suggestServRevision({
      decision: { question: stored.version.question, answers: stored.version.answers, input: labeled[0].challengeInput },
      cases: labeled,
    });
    return attachOwnerCookie(NextResponse.json({ ok: true, candidate }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
