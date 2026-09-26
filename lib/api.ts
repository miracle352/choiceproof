import "server-only";

import { NextResponse } from "next/server";
import { ServAdapterError } from "@/lib/serv";

export function apiError(error: unknown) {
  if (error instanceof ServAdapterError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const known: Record<string, { status: number; message: string }> = {
    DATABASE_NOT_CONFIGURED: { status: 503, message: "Persistent storage is not configured." },
    NODE_NOT_FOUND: { status: 404, message: "Decision workspace was not found." },
    VERSION_NOT_FOUND: { status: 404, message: "Decision version was not found." },
  };
  const match = known[code];
  if (match) {
    return NextResponse.json({ ok: false, error: { code, message: match.message } }, { status: match.status });
  }
  console.error("Unexpected API error", error);
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL_ERROR", message: "The request failed unexpectedly." } },
    { status: 500 },
  );
}

export async function readJson(request: Request) {
  try {
    return { ok: true as const, value: await request.json() as unknown };
  } catch {
    return { ok: false as const, response: NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    ) };
  }
}
