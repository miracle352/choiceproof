import { NextResponse } from "next/server";
import { validateDecisionRequest, type DecisionFailure } from "@/lib/contracts";
import { runServDecision, ServAdapterError } from "@/lib/serv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<DecisionFailure>(
      { ok: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    );
  }

  const parsed = validateDecisionRequest(body);
  if (!parsed.success) {
    return NextResponse.json<DecisionFailure>(
      { ok: false, error: { code: "INVALID_INPUT", message: parsed.message } },
      { status: 400 },
    );
  }

  try {
    const result = await runServDecision(parsed.data);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ServAdapterError) {
      return NextResponse.json<DecisionFailure>(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }

    console.error("Unexpected decision route error", error);
    return NextResponse.json<DecisionFailure>(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "The decision run failed unexpectedly." },
      },
      { status: 500 },
    );
  }
}
