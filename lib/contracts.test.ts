import { describe, expect, it } from "vitest";
import { validateDecisionRequest } from "./contracts";

describe("decision input validation", () => {
  it("normalizes editable fields before they reach SERV", () => {
    expect(validateDecisionRequest({
      question: "  Should this request be approved?  ",
      answers: [" Approve ", " Decline "],
      input: "  Synthetic request  ",
    })).toEqual({
      success: true,
      data: {
        question: "Should this request be approved?",
        answers: ["Approve", "Decline"],
        input: "Synthetic request",
      },
    });
  });

  it("requires two to five unique bounded answers", () => {
    expect(validateDecisionRequest({
      question: "Should this request be approved?",
      answers: ["Approve"],
      input: "Synthetic request",
    })).toMatchObject({ success: false });
    expect(validateDecisionRequest({
      question: "Should this request be approved?",
      answers: ["Approve", "approve"],
      input: "Synthetic request",
    })).toEqual({ success: false, message: "Allowed answers must be unique." });
    expect(validateDecisionRequest({
      question: "Should this request be approved?",
      answers: ["A", "B", "C", "D", "E", "F"],
      input: "Synthetic request",
    })).toMatchObject({ success: false });
  });
});
