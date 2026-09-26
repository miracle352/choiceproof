import { NextResponse } from "next/server";
import { apiError, readJson } from "@/lib/api";
import { validateDecisionRequest } from "@/lib/contracts";
import { proposeServChallenges } from "@/lib/serv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = validateDecisionRequest(body.value);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: "INVALID_INPUT", message: parsed.message } }, { status: 400 });
  }
  try {
    const challenges = await proposeServChallenges(parsed.data);
    return NextResponse.json({ ok: true, challenges }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
