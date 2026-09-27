import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getStored: vi.fn(),
  ensureVersion: vi.fn(),
  saveRun: vi.fn(),
  suggest: vi.fn(),
  decide: vi.fn(),
  budget: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/owner", () => ({
  getOwnerIdentity: () => ({ hash: "disposable-test-owner", cookie: null }),
  attachOwnerCookie: (response: Response) => response,
}));
vi.mock("@/lib/db", () => ({
  getOwnedVersionAndCases: mocks.getStored,
  ensureNodeVersion: mocks.ensureVersion,
  saveRun: mocks.saveRun,
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRunBudget: mocks.budget }));
vi.mock("@/lib/serv", () => ({
  suggestServRevision: mocks.suggest,
  runServDecision: mocks.decide,
}));

import { POST as suggestPOST } from "./suggest/route";
import { POST as evaluatePOST } from "./evaluate/route";

const version = {
  id: "version-base",
  nodeId: "node-test",
  versionNumber: 1,
  question: "Should this synthetic refund be approved?",
  answers: ["Approve", "Escalate", "Decline"],
  candidateSource: "user" as const,
  createdAt: "2026-09-27T00:00:00.000Z",
};

const labeledCase = {
  id: "case-labeled",
  nodeId: "node-test",
  sourceVersionId: version.id,
  setKind: "labeled" as const,
  challengeKind: "manual" as const,
  originalInput: "Labeled synthetic original.",
  challengeInput: "Labeled synthetic challenge.",
  originalAnswer: "Approve",
  challengedAnswer: "Escalate",
  expectedAnswer: "Escalate",
  meaningPreserved: false,
  challengeIntent: "change" as const,
  status: "PASS",
  createdAt: "2026-09-27T00:01:00.000Z",
};

const heldOutCase = {
  ...labeledCase,
  id: "case-held-out-private",
  setKind: "held_out" as const,
  originalInput: "HELD_OUT_SECRET_ORIGINAL",
  challengeInput: "HELD_OUT_SECRET_CHALLENGE",
  createdAt: "2026-09-27T00:02:00.000Z",
};

function jsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("revision route held-out boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStored.mockResolvedValue({ version, cases: [labeledCase, heldOutCase] });
    mocks.suggest.mockResolvedValue({ question: version.question, answers: version.answers });
    mocks.ensureVersion.mockResolvedValue({
      nodeId: version.nodeId,
      version: { ...version, id: "version-candidate", versionNumber: 2 },
    });
    mocks.saveRun.mockResolvedValue("evaluation-run");
    mocks.decide.mockImplementation(async (decision: { input: string }) => ({
      ok: true,
      selectedAnswer: decision.input.includes("HELD_OUT") ? "Escalate" : "Escalate",
      model: "test-model",
      provider: null,
      gateway: "OpenServ SERV Reasoning",
      latencyMs: 1,
      requestId: "test-request",
      finishReason: "tool_calls",
      raw: { test: true },
    }));
  });

  it("excludes the private held-out ID and content from the SERV candidate payload", async () => {
    const response = await suggestPOST(jsonRequest("http://localhost/api/revision/suggest", {
      nodeId: version.nodeId,
      versionId: version.id,
    }));
    expect(response.status).toBe(200);
    expect(mocks.suggest).toHaveBeenCalledOnce();

    const payload = mocks.suggest.mock.calls[0][0];
    const serialized = JSON.stringify(payload);
    expect(payload.cases.map((item: { id: string }) => item.id)).toEqual([labeledCase.id]);
    expect(serialized).not.toContain(heldOutCase.id);
    expect(serialized).not.toContain(heldOutCase.originalInput);
    expect(serialized).not.toContain(heldOutCase.challengeInput);
  });

  it("includes the same held-out case in subsequent evaluation", async () => {
    const response = await evaluatePOST(jsonRequest("http://localhost/api/revision/evaluate", {
      nodeId: version.nodeId,
      baseVersionId: version.id,
      question: version.question,
      answers: version.answers,
      candidateSource: "user",
      labelMapping: {},
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results.map((item: { caseId: string; setKind: string }) => [item.caseId, item.setKind])).toEqual([
      [labeledCase.id, "labeled"],
      [heldOutCase.id, "held_out"],
    ]);
    expect(mocks.decide.mock.calls.some(([decision]) => decision.input === heldOutCase.challengeInput)).toBe(true);
    expect(mocks.budget).toHaveBeenCalledWith(expect.anything(), "disposable-test-owner", 4);
  });
});
