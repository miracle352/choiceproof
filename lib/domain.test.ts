import { describe, expect, it } from "vitest";
import { buildReviewedCase, classifyChallengeReview, compareVersionOutcome, isExpectedLabelValid, mapExpectedLabel, repeatedRunDisagrees, revisionCaseDisposition } from "./domain";

describe("challenge review classification", () => {
  it("treats a changed answer as review-needed until a human supplies both labels", () => {
    expect(
      classifyChallengeReview({
        originalAnswer: "Approve",
        challengedAnswer: "Decline",
      }),
    ).toBe("ANSWER_CHANGED_REVIEW_NEEDED");
  });

  it("builds a saved case from the measured snapshot, not later draft edits", () => {
    const measured = {
      originalInput: "Measured original",
      challengeInput: "Measured challenge",
      originalAnswer: "Approve",
      challengedAnswer: "Decline",
    };
    const reviewed = buildReviewedCase({
      measured,
      expectedAnswer: "Approve",
      meaningPreserved: true,
    });

    expect(reviewed).toMatchObject({
      ...measured,
      expectedAnswer: "Approve",
      meaningPreserved: true,
      status: "VERIFIED_FAILURE",
    });
  });

  it("only calls a changed answer a verified failure when meaning is preserved and it misses the expected label", () => {
    expect(
      classifyChallengeReview({
        originalAnswer: "Approve",
        challengedAnswer: "Decline",
        expectedAnswer: "Approve",
        meaningPreserved: true,
      }),
    ).toBe("VERIFIED_FAILURE");

    expect(
      classifyChallengeReview({
        originalAnswer: "Approve",
        challengedAnswer: "Decline",
        expectedAnswer: "Decline",
        meaningPreserved: false,
      }),
    ).toBe("NOT_COMPARABLE");
  });
});

describe("label migration", () => {
  it("requires relabeling when a removed answer has no explicit valid mapping", () => {
    expect(
      mapExpectedLabel({
        expectedAnswer: "Escalate",
        oldAnswers: ["Approve", "Escalate", "Decline"],
        newAnswers: ["Approve", "Manual review", "Decline"],
        mapping: {},
      }),
    ).toEqual({ status: "NEEDS_RELABELING" });
  });

  it("uses an explicit mapping and rejects mappings outside the new answer set", () => {
    const shared = {
      expectedAnswer: "Escalate",
      oldAnswers: ["Approve", "Escalate", "Decline"],
      newAnswers: ["Approve", "Manual review", "Decline"],
    };
    expect(mapExpectedLabel({ ...shared, mapping: { Escalate: "Manual review" } })).toEqual({
      status: "MAPPED",
      answer: "Manual review",
    });
    expect(mapExpectedLabel({ ...shared, mapping: { Escalate: "Maybe" } })).toEqual({
      status: "NEEDS_RELABELING",
    });
  });
});

describe("revision evaluation", () => {
  it("skips reviewer-marked non-comparable cases instead of crediting a pass or failure", () => {
    expect(revisionCaseDisposition(false)).toBe("NOT_COMPARABLE");
    expect(revisionCaseDisposition(true)).toBe("READY");
  });

  it("reports a repair that improves one case but regresses another", () => {
    const repaired = compareVersionOutcome({
      baselineAnswer: "Decline",
      candidateAnswer: "Approve",
      expectedAnswer: "Approve",
    });
    const regressed = compareVersionOutcome({
      baselineAnswer: "Escalate",
      candidateAnswer: "Decline",
      expectedAnswer: "Escalate",
    });

    expect(repaired.verdict).toBe("IMPROVEMENT");
    expect(regressed.verdict).toBe("REGRESSION");
  });
});

describe("repeatability", () => {
  it("flags disagreement only for the exact same decision snapshot", () => {
    expect(repeatedRunDisagrees({ sameSnapshot: true, previousAnswer: "Approve", nextAnswer: "Decline" })).toBe(true);
    expect(repeatedRunDisagrees({ sameSnapshot: false, previousAnswer: "Approve", nextAnswer: "Decline" })).toBe(false);
  });
});

describe("human label validation", () => {
  it("rejects a contradictory expected label outside the measured schema", () => {
    expect(isExpectedLabelValid(["Approve", "Decline"], "Escalate")).toBe(false);
    expect(isExpectedLabelValid(["Approve", "Decline"], "Approve")).toBe(true);
  });
});
