import { afterEach, describe, expect, it, vi } from "vitest";
import { runServDecision, ServAdapterError } from "./serv";

const decision = {
  question: "Should this request be approved?",
  answers: ["Approve", "Decline"],
  input: "Synthetic request",
};

describe("SERV failure handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns an actionable auth category without exposing the upstream body", async () => {
    vi.stubEnv("SERV_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: "secret upstream diagnostic" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    await expect(runServDecision(decision)).rejects.toMatchObject({
      code: "SERV_AUTH_FAILED",
      status: 401,
      message: "SERV rejected the configured API key.",
    });
  });

  it("rejects an otherwise valid response outside the allowed answer set", async () => {
    vi.stubEnv("SERV_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "req_test",
      model: "test-model",
      choices: [{
        finish_reason: "tool_calls",
        message: { tool_calls: [{ function: { name: "submit_decision", arguments: JSON.stringify({ answer: "Maybe" }) } }] },
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const result = runServDecision(decision);
    await expect(result).rejects.toBeInstanceOf(ServAdapterError);
    await expect(result).rejects.toMatchObject({ code: "OUT_OF_BOUNDS_RESPONSE" });
  });
});
