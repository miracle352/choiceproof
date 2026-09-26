import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { validateDecisionRequest } from "@/lib/contracts";
import { proposeServChallenges } from "@/lib/serv";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";
import { enforceRunBudget } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  const body = await readJson(request);
  if (!body.ok) return attachOwnerCookie(body.response, owner);
  const parsed = validateDecisionRequest(body.value);
  if (!parsed.success) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: parsed.message } }, { status: 400 }), owner);
  }
  try {
    await enforceRunBudget(request, owner.hash, 1);
    const challenges = await proposeServChallenges(parsed.data);
    return attachOwnerCookie(NextResponse.json({ ok: true, challenges }, { headers: { "Cache-Control": "no-store" } }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
