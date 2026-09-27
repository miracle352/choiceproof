import { describe, expect, it } from "vitest";
import { beginJevAttempt, failJevAttempt, jevUiLabel, settleJevAttempt, type JevUiState } from "./jev-ui";

const priorLive: JevUiState = {
  status: "live",
  observedBehavior: "flipped",
  apparentRelevance: "decision_relevant",
  reviewPriority: "urgent",
  model: "openjev",
  latencyMs: 40,
  raw: { prior: true },
};

describe("Jev UI attempt isolation", () => {
  it("clears prior analysis as soon as a new comparison starts", () => {
    expect(priorLive.status).toBe("live");
    expect(beginJevAttempt()).toEqual({ status: "loading" });
  });

  it("keeps a failed current attempt unavailable without inheriting prior evidence", () => {
    expect(failJevAttempt(2, 2, { code: "JEV_TIMEOUT", reason: "Timed out." })).toEqual({
      status: "failed",
      code: "JEV_TIMEOUT",
      reason: "Timed out.",
    });
  });

  it("rejects a late response from an earlier comparison", () => {
    expect(settleJevAttempt(1, 2, priorLive)).toBeNull();
    expect(failJevAttempt(1, 2, { code: "JEV_UNREACHABLE", reason: "Unavailable." })).toBeNull();
  });

  it("labels failed analysis as unavailable while preserving loading and live states", () => {
    expect(jevUiLabel({ status: "failed", code: "JEV_TIMEOUT", reason: "Timed out." })).toBe("UNAVAILABLE");
    expect(jevUiLabel({ status: "unavailable", reason: "Not configured." })).toBe("UNAVAILABLE");
    expect(jevUiLabel({ status: "loading" })).toBe("LOADING");
    expect(jevUiLabel(priorLive)).toBe("LIVE");
  });
});
