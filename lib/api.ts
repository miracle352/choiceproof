import "server-only";

import { NextResponse } from "next/server";
import { ServAdapterError } from "@/lib/serv";
import { classifyDatabaseError, DatabaseAccessError } from "@/lib/db";

export type PublicApiError = { status: number; code: string; message: string };

export function publicErrorFor(error: unknown): PublicApiError {
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
  try {
    return { ok: true as const, value: await request.json() as unknown };
  } catch {
    return { ok: false as const, response: NextResponse.json(
      { ok: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      { status: 400 },
    ) };
  }
}
