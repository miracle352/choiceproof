import "server-only";

import type { JevAnalysis } from "@/lib/contracts";

const JEV_ENDPOINT = "https://api.openjev.sh/v1/systemone";
const APPARENT_RELEVANCE = ["apparently_irrelevant", "decision_relevant", "ambiguous"] as const;
const REVIEW_PRIORITY = ["routine", "review", "urgent"] as const;
const MAX_RESPONSE_BYTES = 1_000_000;

type ChoiceAnswer = {
  type?: unknown;
  choice?: unknown;
  probabilities?: unknown;
  confidence?: unknown;
};

export class JevAdapterError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "JevAdapterError";
  }
}

export function isJevConfigured() {
  const key = process.env.OPENJEV_API_KEY?.trim();
  return Boolean(key && key !== "[SENSITIVE]");
}

function readChoice<T extends readonly string[]>(value: unknown, allowed: T, name: string): T[number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JevAdapterError("INVALID_JEV_RESPONSE", `Jev returned no ${name} analysis.`);
  }
  const answer = value as ChoiceAnswer;
  if (answer.type !== "choice" || typeof answer.choice !== "string" || !allowed.includes(answer.choice)) {
    throw new JevAdapterError("INVALID_JEV_RESPONSE", `Jev returned an invalid ${name} choice.`);
  }
  if (answer.confidence !== undefined && (typeof answer.confidence !== "number" || answer.confidence < 0 || answer.confidence > 1)) {
    throw new JevAdapterError("INVALID_JEV_RESPONSE", `Jev returned invalid ${name} confidence.`);
  }
  if (answer.probabilities !== undefined) {
    if (!answer.probabilities || typeof answer.probabilities !== "object" || Array.isArray(answer.probabilities)) {
      throw new JevAdapterError("INVALID_JEV_RESPONSE", `Jev returned invalid ${name} probabilities.`);
    }
    for (const probability of Object.values(answer.probabilities as Record<string, unknown>)) {
      if (typeof probability !== "number" || probability < 0 || probability > 1) {
        throw new JevAdapterError("INVALID_JEV_RESPONSE", `Jev returned invalid ${name} probabilities.`);
      }
    }
  }
  return answer.choice as T[number];
}

export async function analyzeExperimentWithJev(input: {
  question: string;
  answers: string[];
  originalInput: string;
  challengeInput: string;
  originalAnswer: string;
  challengedAnswer: string;
}): Promise<JevAnalysis> {
  const apiKey = process.env.OPENJEV_API_KEY?.trim();
  if (!isJevConfigured() || !apiKey) throw new JevAdapterError("JEV_NOT_CONFIGURED", "Jev analysis is not configured.");
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENJEV_MODEL?.trim() || "openjev",
        state: {
          scope: "Analyze this comparison experiment only. Do not decide the underlying refund request and do not judge correctness.",
          decision_question: input.question,
          allowed_answers: input.answers,
          original_input: input.originalInput,
          challenged_input: input.challengeInput,
          original_serv_answer: input.originalAnswer,
          challenged_serv_answer: input.challengedAnswer,
        },
        questions: {
          apparent_relevance: {
            type: "choice",
            instructions: "How apparently relevant is the input edit to the bounded decision question? Judge the edit, not which refund answer is correct.",
            criteria: {
              apparently_irrelevant: "The edit appears unrelated to evidence used by the decision question.",
              decision_relevant: "The edit appears to add, remove, or alter evidence directly relevant to the decision question.",
              ambiguous: "The edit's relevance cannot be determined clearly from the supplied experiment.",
            },
          },
          review_priority: {
            type: "choice",
            instructions: "What human review priority is appropriate for this experiment result? This is triage only, not a correctness decision.",
            criteria: {
              routine: "The answer held and the edit appears irrelevant or low consequence.",
              review: "The result deserves normal human review because the edit or answer behavior may matter.",
              urgent: "The answer behavior and apparently relevant edit indicate prompt attention before relying on this decision specification.",
            },
          },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new JevAdapterError("JEV_TIMEOUT", "Jev did not respond before the 12 second timeout.");
    }
    throw new JevAdapterError("JEV_UNREACHABLE", "Jev could not be reached.");
  }
  if (!response.ok) {
    const code = response.status === 401 ? "JEV_AUTH_FAILED" : response.status === 429 ? "JEV_RATE_LIMITED" : response.status === 422 ? "JEV_INVALID_REQUEST" : "JEV_UPSTREAM_FAILED";
    throw new JevAdapterError(code, response.status === 429 ? "Jev rate-limited this analysis. Retry shortly." : "Jev could not complete this analysis.");
  }
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new JevAdapterError("JEV_RESPONSE_TOO_LARGE", "Jev returned more data than this public demo accepts.");
  }
  const responseText = await response.text();
  if (new TextEncoder().encode(responseText).byteLength > MAX_RESPONSE_BYTES) {
    throw new JevAdapterError("JEV_RESPONSE_TOO_LARGE", "Jev returned more data than this public demo accepts.");
  }
  let raw: unknown = null;
  try {
    raw = JSON.parse(responseText);
  } catch {
    // Handled by the strict object check below.
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new JevAdapterError("INVALID_JEV_RESPONSE", "Jev returned an unreadable response.");
  const result = raw as { model?: unknown; answers?: Record<string, unknown> };
  return {
    status: "live",
    observedBehavior: input.originalAnswer === input.challengedAnswer ? "held" : "flipped",
    apparentRelevance: readChoice(result.answers?.apparent_relevance, APPARENT_RELEVANCE, "relevance"),
    reviewPriority: readChoice(result.answers?.review_priority, REVIEW_PRIORITY, "priority"),
    model: typeof result.model === "string" ? result.model : "Not returned",
    latencyMs: Math.round(performance.now() - startedAt),
    raw,
  };
}
