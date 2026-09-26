export type PublicComparison = {
  schemaVersion?: 2;
  question: string;
  answers: string[];
  originalInput: string;
  challengeInput: string;
  original: { selectedAnswer: string; model: string; provider: string | null; latencyMs: number };
  challenged: { selectedAnswer: string; model: string; provider: string | null; latencyMs: number };
  expectedAnswer: string;
  meaningPreserved: boolean;
  challengeIntent: "preserve" | "change" | null;
  classification: string;
  challengeKind: string;
  recordedAt?: { original: string; challenged: string; case: string };
  jev?: {
    observedBehavior: "held" | "flipped";
    apparentRelevance: "apparently_irrelevant" | "decision_relevant" | "ambiguous";
    reviewPriority: "routine" | "review" | "urgent";
    model: string;
    latencyMs: number;
    recordedAt: string;
  } | null;
};

export type PublishedEvidence = { id: string; payload: PublicComparison; createdAt: string; expiresAt: string };

export function isCompletePublishedEvidence(item: PublishedEvidence) {
  const payload = item.payload;
  return payload.schemaVersion === 2
    && Boolean(payload.question?.trim())
    && Array.isArray(payload.answers)
    && payload.answers.length >= 2
    && payload.answers.includes(payload.original?.selectedAnswer)
    && payload.answers.includes(payload.challenged?.selectedAnswer)
    && payload.answers.includes(payload.expectedAnswer)
    && Boolean(payload.originalInput?.trim())
    && Boolean(payload.challengeInput?.trim())
    && Boolean(payload.original?.model?.trim())
    && Boolean(payload.challenged?.model?.trim())
    && Boolean(payload.recordedAt?.original)
    && Boolean(payload.recordedAt?.challenged)
    && Boolean(payload.recordedAt?.case);
}
