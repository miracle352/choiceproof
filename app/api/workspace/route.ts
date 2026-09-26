import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getWorkspace } from "@/lib/db";
import { attachOwnerCookie, getOwnerIdentity } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const owner = getOwnerIdentity(request);
  try {
    const workspace = await getWorkspace(owner.hash);
    return attachOwnerCookie(NextResponse.json({ ok: true, workspace }, { headers: { "Cache-Control": "no-store" } }), owner);
  } catch (error) {
    return attachOwnerCookie(apiError(error), owner);
  }
}
