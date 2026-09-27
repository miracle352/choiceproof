import { describe, expect, it } from "vitest";
import { controlledFacts, selectHomepageRecord } from "./homepage-evidence";

function record(originalInput: string, challengeInput: string) {
  return { payload: { originalInput, challengeInput } };
}

describe("homepage evidence selection", () => {
  it("accepts one concise replacement and keeps the unit readable", () => {
    const candidate = record("The request arrived after 4 days.", "The request arrived after 45 days.");
    expect(selectHomepageRecord([candidate])).toBe(candidate);
    expect(controlledFacts(candidate.payload.originalInput, candidate.payload.challengeInput)).toMatchObject({
      original: "4 days",
      changed: "45 days",
      isSingleReplacement: true,
    });
  });

  it("rejects a published case that changes multiple facts", () => {
    const misleading = record(
      "The carrier confirms a late delivery and the package was sealed.",
      "The carrier confirms an on-time delivery and the package was opened.",
    );
    expect(selectHomepageRecord([misleading])).toBeNull();
  });

  it("rejects an appended sentence mislabeled as a controlled replacement", () => {
    const appended = record("The request arrived after 4 days.", "The request arrived after 4 days. The return window expired.");
    expect(selectHomepageRecord([appended])).toBeNull();
  });
});
