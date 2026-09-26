export type DecisionRequest = {
  question: string;
  answers: string[];
  input: string;
};

export type DecisionSuccess = {
  ok: true;
  selectedAnswer: string;
  model: string;
  provider: string | null;
  gateway: "OpenServ SERV Reasoning";
  latencyMs: number;
  requestId: string | null;
  finishReason: string | null;
  raw: unknown;
};

export type DecisionFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type DecisionResponse = DecisionSuccess | DecisionFailure;

export type DecisionSnapshot = {
  question: string;
  answers: string[];
  input: string;
};

export type ComparisonSnapshot = {
  question: string;
  answers: string[];
  originalInput: string;
  challengeInput: string;
};

export const CHALLENGE_KINDS = [
  "irrelevant_context",
  "reordered_evidence",
  "ambiguity",
  "conflicting_evidence",
  "embedded_instruction",
] as const;

export type ChallengeKind = (typeof CHALLENGE_KINDS)[number] | "manual";

export type ChallengeProposal = {
  kind: Exclude<ChallengeKind, "manual">;
  label: string;
  input: string;
};

export type PersistedCase = {
  id: string;
  nodeId: string;
  sourceVersionId: string;
  setKind: "labeled" | "held_out";
  challengeKind: ChallengeKind;
  originalInput: string;
  challengeInput: string;
  originalAnswer: string;
  challengedAnswer: string;
  expectedAnswer: string;
  meaningPreserved: boolean;
  status: string;
  createdAt: string;
};

export type DecisionVersion = {
  id: string;
  nodeId: string;
  versionNumber: number;
  question: string;
  answers: string[];
  candidateSource: "user" | "serv";
  createdAt: string;
};

export type WorkspaceSnapshot = {
  node: { id: string; title: string } | null;
  version: DecisionVersion | null;
  cases: PersistedCase[];
  persistenceConfigured: boolean;
};

export type ComparisonSuccess = {
  ok: true;
  nodeId: string;
  version: DecisionVersion;
  original: DecisionSuccess;
  challenged: DecisionSuccess;
  originalRunId: string;
  challengedRunId: string;
  challengeKind: ChallengeKind;
  snapshot: ComparisonSnapshot;
};

export const MAX_QUESTION_LENGTH = 1200;
export const MAX_ANSWER_LENGTH = 120;
export const MAX_INPUT_LENGTH = 12_000;

function comparableLabel(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function validateDecisionRequest(value: unknown):
  | { success: true; data: DecisionRequest }
  | { success: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, message: "Request body must be a JSON object." };
  }

  const body = value as Record<string, unknown>;
  if (typeof body.question !== "string") {
    return { success: false, message: "Decision question is required." };
  }

  const question = body.question.trim();
  if (question.length < 8 || question.length > MAX_QUESTION_LENGTH) {
    return {
      success: false,
      message: `Decision question must be 8–${MAX_QUESTION_LENGTH} characters.`,
    };
  }

  if (!Array.isArray(body.answers) || body.answers.length < 2 || body.answers.length > 5) {
    return { success: false, message: "Provide between 2 and 5 allowed answers." };
  }

  const answers: string[] = [];
  for (const item of body.answers) {
    if (typeof item !== "string") {
      return { success: false, message: "Every allowed answer must be text." };
    }
    const answer = item.trim();
    if (!answer || answer.length > MAX_ANSWER_LENGTH) {
      return {
        success: false,
        message: `Each allowed answer must be 1–${MAX_ANSWER_LENGTH} characters.`,
      };
    }
    answers.push(answer);
  }

  if (new Set(answers.map((answer) => answer.toLocaleLowerCase())).size !== answers.length) {
    return { success: false, message: "Allowed answers must be unique." };
  }

  const labels = answers.map(comparableLabel);
  if (labels.some((label, index) => labels.some((other, otherIndex) => index !== otherIndex && (label.includes(other) || other.includes(label))))) {
    return { success: false, message: "Allowed answers must not overlap or contain one another. Use distinct labels." };
  }

  if (typeof body.input !== "string") {
    return { success: false, message: "Sample input is required." };
  }

  const input = body.input.trim();
  if (!input || input.length > MAX_INPUT_LENGTH) {
    return {
      success: false,
      message: `Sample input must be 1–${MAX_INPUT_LENGTH.toLocaleString()} characters.`,
    };
  }

  return { success: true, data: { question, answers, input } };
}
