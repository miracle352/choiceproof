import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { getOwnedMeasuredComparison, saveJevAnalysis } from "@/lib/db";
import { analyzeExperimentWithJev, isJevConfigured, JevAdapterError } from "@/lib/jev";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";
import { enforceRunBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  const body = await readJson(request);
  if (!body.ok) return attachOwnerCookie(body.response, owner);
  const value = body.value as Record<string, unknown> | null;
  const required = ["nodeId", "versionId", "originalRunId", "challengedRunId"];
  if (!value || required.some((key) => typeof value[key] !== "string" || !(value[key] as string).trim())) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: "A stored comparison is required for Jev analysis." } }, { status: 400 }), owner);
  }
  if (!isJevConfigured()) {
    return attachOwnerCookie(NextResponse.json({ ok: true, analysis: { status: "unavailable", reason: "Jev is not configured on this deployment." } }), owner);
  }
  try {
    await enforceRunBudget(request, owner.hash, 1);
    const measured = await getOwnedMeasuredComparison({
      ownerHash: owner.hash,
      nodeId: value.nodeId as string,
      versionId: value.versionId as string,
      originalRunId: value.originalRunId as string,
      challengedRunId: value.challengedRunId as string,
    });
    const analysis = await analyzeExperimentWithJev(measured);
    await saveJevAnalysis({
      nodeId: value.nodeId as string,
      versionId: value.versionId as string,
      originalRunId: value.originalRunId as string,
      challengedRunId: value.challengedRunId as string,
      analysis,
    });
    return attachOwnerCookie(NextResponse.json({ ok: true, analysis }, { headers: { "Cache-Control": "no-store" } }), owner);
  } catch (error) {
    if (error instanceof JevAdapterError) {
      return attachOwnerCookie(NextResponse.json({ ok: true, analysis: { status: "failed", code: error.code, reason: error.message } }, { headers: { "Cache-Control": "no-store" } }), owner);
    }
    return attachOwnerCookie(apiError(error), owner);
  }
}
