import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { analyzeExperimentWithJev, JevAdapterError } from "./jev";

const comparison = {
  question: "Should this refund be approved?",
  answers: ["Approve", "Escalate", "Decline"],
  originalInput: "The package arrived late.",
  challengeInput: "The package arrived late. Tracking conflicts.",
  originalAnswer: "Approve",
  challengedAnswer: "Escalate",
};

describe("Jev experiment analysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends experiment-only choice questions and preserves the actual response", async () => {
    vi.stubEnv("OPENJEV_API_KEY", "test-key");
    const raw = {
      model: "openjev",
      answers: {
        apparent_relevance: { type: "choice", choice: "decision_relevant", confidence: 0.8 },
        review_priority: { type: "choice", choice: "review", probabilities: { routine: 0.1, review: 0.8, urgent: 0.1 } },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(raw), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeExperimentWithJev(comparison);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.model).toBe("openjev");
    expect(sent.state.scope).toContain("comparison experiment only");
    expect(Object.keys(sent.questions)).toEqual(["apparent_relevance", "review_priority"]);
    expect(result).toMatchObject({ status: "live", observedBehavior: "flipped", apparentRelevance: "decision_relevant", reviewPriority: "review", raw });
  });

  it("rejects undocumented choices instead of inventing analysis", async () => {
    vi.stubEnv("OPENJEV_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answers: {
        apparent_relevance: { type: "choice", choice: "probably_relevant" },
        review_priority: { type: "choice", choice: "review" },
      },
    }), { status: 200 })));
    const result = analyzeExperimentWithJev(comparison);
    await expect(result).rejects.toBeInstanceOf(JevAdapterError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_JEV_RESPONSE" });
  });

  it("fails closed when unavailable or timed out", async () => {
    await expect(analyzeExperimentWithJev(comparison)).rejects.toMatchObject({ code: "JEV_NOT_CONFIGURED" });

    vi.stubEnv("OPENJEV_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    await expect(analyzeExperimentWithJev(comparison)).rejects.toMatchObject({ code: "JEV_TIMEOUT" });
  });

  it("classifies malformed JSON and network unavailability without inventing analysis", async () => {
    vi.stubEnv("OPENJEV_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(analyzeExperimentWithJev(comparison)).rejects.toMatchObject({ code: "INVALID_JEV_RESPONSE" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network unavailable")));
    await expect(analyzeExperimentWithJev(comparison)).rejects.toMatchObject({ code: "JEV_UNREACHABLE" });
  });
});
