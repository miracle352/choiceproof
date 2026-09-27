import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  measured: vi.fn(),
  save: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getOwnedMeasuredComparison: mocks.measured,
  saveJevAnalysis: mocks.save,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRunBudget: vi.fn() }));
vi.mock("@/lib/owner", () => ({
  getOwnerIdentity: () => ({ hash: "isolated-owner", cookie: null }),
  attachOwnerCookie: (response: Response) => response,
}));
vi.mock("@/lib/jev", () => {
  class JevAdapterError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = "JevAdapterError";
    }
  }
  return {
    JevAdapterError,
    analyzeExperimentWithJev: mocks.analyze,
    isJevConfigured: () => true,
  };
});

import { JevAdapterError } from "@/lib/jev";
import { POST } from "./route";

const storedComparison = {
  question: "Should this refund be approved?",
  answers: ["Approve", "Escalate", "Decline"],
  originalInput: "Synthetic original input.",
  challengeInput: "Synthetic challenged input.",
  originalAnswer: "Approve",
  challengedAnswer: "Escalate",
};

function request() {
  return new NextRequest("http://localhost/api/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nodeId: "node-test",
      versionId: "version-test",
      originalRunId: "run-original",
      challengedRunId: "run-challenged",
    }),
  });
}

describe("Jev analysis route isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.measured.mockResolvedValue(storedComparison);
  });

  it.each([
    ["JEV_TIMEOUT", "Jev timed out."],
    ["INVALID_JEV_RESPONSE", "Jev returned malformed data."],
    ["JEV_UNREACHABLE", "Jev was unavailable."],
  ])("returns an isolated failed analysis for %s", async (code, message) => {
    mocks.analyze.mockRejectedValueOnce(new JevAdapterError(code, message));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: true, analysis: { status: "failed", code, reason: message } });
    expect(mocks.measured).toHaveBeenCalledWith(expect.objectContaining({ originalRunId: "run-original", challengedRunId: "run-challenged" }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
