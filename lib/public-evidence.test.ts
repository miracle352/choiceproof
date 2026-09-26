import { describe, expect, it } from "vitest";
import { isCompletePublishedEvidence, type PublishedEvidence } from "./public-evidence";

const complete: PublishedEvidence = {
  id: "abcdefghijklmnopqrstuvwx",
  createdAt: "2026-09-27T00:00:00.000Z",
  expiresAt: "2026-10-27T00:00:00.000Z",
  payload: {
    schemaVersion: 2,
    question: "Should this refund be approved, escalated, or declined?",
    answers: ["Approve", "Escalate", "Decline"],
    originalInput: "The package is unopened.",
    challengeInput: "The package is opened.",
    original: { selectedAnswer: "Approve", model: "recorded-model", provider: null, latencyMs: 100 },
    challenged: { selectedAnswer: "Escalate", model: "recorded-model", provider: null, latencyMs: 120 },
    expectedAnswer: "Escalate",
    meaningPreserved: false,
    challengeIntent: "change",
    classification: "PASS",
    challengeKind: "manual",
    recordedAt: {
      original: "2026-09-27T00:00:01.000Z",
      challenged: "2026-09-27T00:00:02.000Z",
      case: "2026-09-27T00:00:03.000Z",
    },
    jev: null,
  },
};

describe("public evidence completeness", () => {
  it("accepts only a versioned record with bounded answers, models, inputs, and timestamps", () => {
    expect(isCompletePublishedEvidence(complete)).toBe(true);
  });

  it("rejects legacy, incomplete, and out-of-bound records from the public collection", () => {
    expect(isCompletePublishedEvidence({ ...complete, payload: { ...complete.payload, schemaVersion: undefined } })).toBe(false);
    expect(isCompletePublishedEvidence({ ...complete, payload: { ...complete.payload, recordedAt: undefined } })).toBe(false);
    expect(isCompletePublishedEvidence({ ...complete, payload: { ...complete.payload, expectedAnswer: "Refund" } })).toBe(false);
    expect(isCompletePublishedEvidence({ ...complete, payload: { ...complete.payload, challenged: { ...complete.payload.challenged, model: "" } } })).toBe(false);
  });
});
