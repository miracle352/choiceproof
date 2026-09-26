import { describe, expect, it } from "vitest";
import { isResponseCurrent, resolveProductCapabilities } from "./capabilities";

describe("product run modes", () => {
  it("keeps no-key mode read-only and sample-labeled", () => {
    expect(resolveProductCapabilities({
      servConfigured: false,
      databaseConfigured: true,
      persistenceHealth: "available",
    })).toEqual({
      mode: "sample",
      canRunDecision: false,
      canGenerateChallenges: false,
      canRunComparison: false,
      canSaveCases: false,
      canEvaluateRevisions: false,
    });
  });

  it("allows a genuine one-off decision without persistence", () => {
    const capabilities = resolveProductCapabilities({
      servConfigured: true,
      databaseConfigured: false,
      persistenceHealth: "not_configured",
    });
    expect(capabilities.mode).toBe("decision_only");
    expect(capabilities.canRunDecision).toBe(true);
    expect(capabilities.canRunComparison).toBe(false);
  });

  it("does not treat a configured but failed database as healthy", () => {
    const capabilities = resolveProductCapabilities({
      servConfigured: true,
      databaseConfigured: true,
      persistenceHealth: "failed",
    });
    expect(capabilities.mode).toBe("decision_only");
    expect(capabilities.canRunDecision).toBe(true);
    expect(capabilities.canSaveCases).toBe(false);
  });

  it("enables the full workflow only after persistence is reachable", () => {
    expect(resolveProductCapabilities({
      servConfigured: true,
      databaseConfigured: true,
      persistenceHealth: "available",
    }).mode).toBe("full");
  });
});

describe("request ordering", () => {
  it("rejects stale responses from an older run", () => {
    expect(isResponseCurrent(3, 4)).toBe(false);
    expect(isResponseCurrent(4, 4)).toBe(true);
  });
});
