import type { JevAnalysis } from "@/lib/contracts";

export type JevUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; code: string; reason: string }
  | JevAnalysis;

export function beginJevAttempt(): JevUiState {
  return { status: "loading" };
}

export function settleJevAttempt(
  attemptId: number,
  currentAttemptId: number,
  next: JevUiState,
): JevUiState | null {
  return attemptId === currentAttemptId ? next : null;
}

export function failJevAttempt(
  attemptId: number,
  currentAttemptId: number,
  error: { code: string; reason: string },
): JevUiState | null {
  return settleJevAttempt(attemptId, currentAttemptId, { status: "failed", ...error });
}

export function jevUiLabel(state: JevUiState) {
  if (state.status === "live") return "LIVE";
  if (state.status === "loading") return "LOADING";
  return "UNAVAILABLE";
}
