import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { isPersistenceConfigured, reserveRunUnits } from "@/lib/db";
import { reserveBudgetUnit } from "@/lib/run-budget";

const WINDOW_MS = 5 * 60 * 1000;
const WINDOW_LIMIT = 40;
const memory = new Map<string, { window: number; units: number }>();

export class RunBudgetError extends Error {
  readonly code = "RUN_BUDGET_EXCEEDED";
  readonly status = 429;
  constructor(public readonly retryAfterSeconds: number) {
    super(`Public demo budget reached. Try again in about ${retryAfterSeconds} seconds.`);
    this.name = "RunBudgetError";
  }
}

export function publicClientKey(request: NextRequest, ownerHash: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "no-forwarded-ip";
  const salt = process.env.RATE_LIMIT_SALT?.trim() || ownerHash;
  const ipHash = createHash("sha256").update(`${salt}:${forwarded}`).digest("hex");
  return createHash("sha256").update(`${ownerHash}:${ipHash}`).digest("hex");
}

export async function enforceRunBudget(request: NextRequest, ownerHash: string, units: number) {
  const key = publicClientKey(request, ownerHash);
  const window = Math.floor(Date.now() / WINDOW_MS);
  let allowed: boolean;

  if (isPersistenceConfigured()) {
    try {
      allowed = await reserveRunUnits(key, window, units, WINDOW_LIMIT);
    } catch {
      allowed = reserveInMemory(key, window, units);
    }
  } else {
    allowed = reserveInMemory(key, window, units);
  }

  if (!allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - Date.now()) / 1000));
    throw new RunBudgetError(retryAfterSeconds);
  }
}

function reserveInMemory(key: string, window: number, units: number) {
  const previous = memory.get(key);
  const reservation = reserveBudgetUnit({ previous, window, units, limit: WINDOW_LIMIT });
  if (!reservation.allowed) return false;
  memory.set(key, reservation.entry);
  if (memory.size > 2_000) {
    for (const [entry, value] of memory) if (value.window < window) memory.delete(entry);
  }
  return true;
}

export const RUN_BUDGET = { windowMinutes: 5, units: WINDOW_LIMIT } as const;
