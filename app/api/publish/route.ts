import { NextRequest, NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { publishOwnedCase } from "@/lib/db";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  const body = await readJson(request);
  if (!body.ok) return attachOwnerCookie(body.response, owner);
  const value = body.value as Record<string, unknown> | null;
  if (!value || typeof value.caseId !== "string" || value.consent !== true) {
    return attachOwnerCookie(NextResponse.json({ ok: false, error: { code: "PUBLISH_CONSENT_REQUIRED", message: "Choose a saved case and explicitly confirm publication." } }, { status: 400 }), owner);
  }
  try {
    const result = await publishOwnedCase({ ownerHash: owner.hash, caseId: value.caseId });
    return attachOwnerCookie(NextResponse.json({ ok: true, path: `/share/${result.id}`, expiresAt: result.expiresAt }, { headers: { "Cache-Control": "no-store" } }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
