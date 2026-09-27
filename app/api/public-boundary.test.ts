import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PublishedEvidence } from "@/lib/public-evidence";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/owner", () => ({
  getOwnerIdentity: () => ({ hash: "different-anonymous-owner", cookie: null }),
  attachOwnerCookie: (response: Response) => response,
}));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db")>(),
  listPublishedResults: mocks.list,
  publishOwnedCase: mocks.publish,
}));

import { GET as evidenceGET } from "./evidence/route";
import { POST as publishPOST } from "./publish/route";

const published: PublishedEvidence = {
  id: "abcdefghijklmnopqrstuvwx",
  createdAt: "2026-09-27T00:00:00.000Z",
  expiresAt: "2026-10-27T00:00:00.000Z",
  payload: {
    schemaVersion: 2,
    question: "Should this synthetic refund be approved?",
    answers: ["Approve", "Escalate", "Decline"],
    originalInput: "Synthetic original.",
    challengeInput: "Synthetic challenge.",
    original: { selectedAnswer: "Approve", model: "recorded-model", provider: null, latencyMs: 90 },
    challenged: { selectedAnswer: "Escalate", model: "recorded-model", provider: null, latencyMs: 110 },
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

function publishRequest(body: unknown) {
  return new NextRequest("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public evidence server boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([published]);
  });

  it("returns only the sanitized, explicitly published payload", async () => {
    const response = await evidenceGET();
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body).toEqual({ ok: true, evidence: [published], count: 1 });
    expect(serialized).not.toContain("raw_response");
    expect(serialized).not.toContain("owner_hash");
    expect(serialized).not.toContain("apiKey");
  });

  it("requires explicit publication consent before touching storage", async () => {
    const response = await publishPOST(publishRequest({ caseId: "private-case", consent: false }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PUBLISH_CONSENT_REQUIRED" } });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["private-case-guessed", "CASE_NOT_FOUND", 404],
    ["held-out-case-guessed", "HELD_OUT_PUBLICATION_FORBIDDEN", 409],
  ])("does not expose %s to another anonymous owner", async (caseId, code, status) => {
    mocks.publish.mockRejectedValueOnce(new Error(code));
    const response = await publishPOST(publishRequest({ caseId, consent: true }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(mocks.publish).toHaveBeenCalledWith({ ownerHash: "different-anonymous-owner", caseId });
  });
});
