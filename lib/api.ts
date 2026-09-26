import "server-only";

import { NextResponse } from "next/server";
import { ServAdapterError } from "@/lib/serv";
import { classifyDatabaseError, DatabaseAccessError } from "@/lib/db";
import { RunBudgetError } from "@/lib/rate-limit";

export type PublicApiError = { status: number; code: string; message: string };
export const MAX_JSON_BODY_BYTES = 32_768;

export function publicErrorFor(error: unknown): PublicApiError {
  if (error instanceof RunBudgetError) {
    return { status: 429, code: error.code, message: error.message };
  }
  if (error instanceof ServAdapterError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof DatabaseAccessError || (error instanceof Error && error.name === "NeonDbError")) {
    const databaseError = classifyDatabaseError(error);
    const messages = {
      DATABASE_CONNECTION_FAILED: "The private workspace database could not be reached. You can still run a one-off decision.",
      DATABASE_SCHEMA_FAILED: "The private workspace schema could not be prepared. Check database permissions and the configured schema.",
      DATABASE_QUERY_FAILED: "The private workspace request failed. You can still run a one-off decision.",
    } as const;
    return { status: 503, code: databaseError.code, message: messages[databaseError.code] };
  }
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const known: Record<string, PublicApiError> = {
    DATABASE_NOT_CONFIGURED: { status: 503, code, message: "Persistent storage is not configured. One-off decisions remain available." },
    NODE_NOT_FOUND: { status: 404, code, message: "Decision workspace was not found." },
    VERSION_NOT_FOUND: { status: 404, code, message: "Decision version was not found." },
    RUN_PAIR_NOT_FOUND: { status: 409, code, message: "The measured comparison could not be verified. Run the comparison again before saving." },
    CASE_NOT_FOUND: { status: 404, code, message: "The saved case was not found in this browser workspace." },
    HELD_OUT_PUBLICATION_FORBIDDEN: { status: 409, code, message: "Held-out cases stay private and cannot be published." },
  };
  return known[code] ?? { status: 500, code: "INTERNAL_ERROR", message: "The request failed unexpectedly." };
}

export function apiError(error: unknown) {
  const publicError = publicErrorFor(error);
  if (publicError.code === "INTERNAL_ERROR") console.error("Unexpected API error", error);
  return NextResponse.json(
    { ok: false, error: { code: publicError.code, message: publicError.message } },
    { status: publicError.status },
  );
}

export async function readJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    return { ok: false as const, response: NextResponse.json(
      { ok: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the 32 KB public demo limit." } },
      { status: 413 },
    ) };
  }
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
      return { ok: false as const, response: NextResponse.json(
        { ok: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body exceeds the 32 KB public demo limit." } },
        { status: 413 },
      ) };
    }
    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const, response: NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    ) };
  }
}
