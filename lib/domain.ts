export type ReviewClassification =
  | "ANSWER_CHANGED_REVIEW_NEEDED"
  | "REVIEW_NEEDED"
  | "PASS"
  | "VERIFIED_FAILURE"
  | "NOT_COMPARABLE";

export type CaseSet = "labeled" | "held_out";

export type LabelMapping = Record<string, string | null | undefined>;

export function isExpectedLabelValid(answers: string[], expectedAnswer: string) {
  return answers.includes(expectedAnswer);
}

export function revisionCaseDisposition(meaningPreserved: boolean) {
  return meaningPreserved ? "READY" as const : "NOT_COMPARABLE" as const;
}

export type EvaluationOutcome = {
  baselineAnswer: string;
  candidateAnswer: string;
  expectedAnswer: string;
  baselinePass: boolean;
  candidatePass: boolean;
  verdict: "REGRESSION" | "IMPROVEMENT" | "UNCHANGED_PASS" | "UNCHANGED_FAILURE";
};

export type MeasuredComparison = {
  originalInput: string;
  challengeInput: string;
  originalAnswer: string;
  challengedAnswer: string;
};

export function buildReviewedCase<T extends MeasuredComparison>(input: {
  measured: T;
  expectedAnswer: string;
  meaningPreserved: boolean;
}) {
  return {
    ...input.measured,
    expectedAnswer: input.expectedAnswer,
    meaningPreserved: input.meaningPreserved,
    status: classifyChallengeReview({
      originalAnswer: input.measured.originalAnswer,
      challengedAnswer: input.measured.challengedAnswer,
      expectedAnswer: input.expectedAnswer,
      meaningPreserved: input.meaningPreserved,
    }),
  };
}

export function classifyChallengeReview(input: {
  originalAnswer: string;
  challengedAnswer: string;
  expectedAnswer?: string | null;
  meaningPreserved?: boolean | null;
}): ReviewClassification {
  const answerChanged = input.originalAnswer !== input.challengedAnswer;

  if (!input.expectedAnswer || input.meaningPreserved == null) {
    return answerChanged ? "ANSWER_CHANGED_REVIEW_NEEDED" : "REVIEW_NEEDED";
  }

  if (!input.meaningPreserved) return "NOT_COMPARABLE";

  return input.challengedAnswer === input.expectedAnswer ? "PASS" : "VERIFIED_FAILURE";
}

export function mapExpectedLabel(input: {
  expectedAnswer: string;
  oldAnswers: string[];
  newAnswers: string[];
  mapping: LabelMapping;
}): { status: "MAPPED"; answer: string } | { status: "NEEDS_RELABELING" } {
  const { expectedAnswer, oldAnswers, newAnswers, mapping } = input;
  if (!oldAnswers.includes(expectedAnswer)) return { status: "NEEDS_RELABELING" };
  if (newAnswers.includes(expectedAnswer)) return { status: "MAPPED", answer: expectedAnswer };

  const mapped = mapping[expectedAnswer];
  if (typeof mapped === "string" && newAnswers.includes(mapped)) {
    return { status: "MAPPED", answer: mapped };
  }

  return { status: "NEEDS_RELABELING" };
}

export function compareVersionOutcome(input: {
  baselineAnswer: string;
  candidateAnswer: string;
  expectedAnswer: string;
}): EvaluationOutcome {
  const baselinePass = input.baselineAnswer === input.expectedAnswer;
  const candidatePass = input.candidateAnswer === input.expectedAnswer;

  let verdict: EvaluationOutcome["verdict"];
  if (baselinePass && !candidatePass) verdict = "REGRESSION";
  else if (!baselinePass && candidatePass) verdict = "IMPROVEMENT";
  else if (candidatePass) verdict = "UNCHANGED_PASS";
  else verdict = "UNCHANGED_FAILURE";

  return { ...input, baselinePass, candidatePass, verdict };
}

export function repeatedRunDisagrees(input: { sameSnapshot: boolean; previousAnswer: string; nextAnswer: string }) {
  return input.sameSnapshot && input.previousAnswer !== input.nextAnswer;
}
