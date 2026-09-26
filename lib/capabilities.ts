export type PersistenceHealth = "not_configured" | "checking" | "available" | "failed";

export type ProductMode = "sample" | "initializing" | "decision_only" | "full";

export function resolveProductCapabilities(input: {
  servConfigured: boolean;
  databaseConfigured: boolean;
  persistenceHealth: PersistenceHealth;
}) {
  const canRunDecision = input.servConfigured;
  const canPersist = input.databaseConfigured && input.persistenceHealth === "available";
  const mode: ProductMode = !input.servConfigured
    ? "sample"
    : input.databaseConfigured && input.persistenceHealth === "checking"
      ? "initializing"
    : canPersist
      ? "full"
      : "decision_only";

  return {
    mode,
    canRunDecision,
    canGenerateChallenges: input.servConfigured,
    canRunComparison: input.servConfigured && canPersist,
    canSaveCases: input.servConfigured && canPersist,
    canEvaluateRevisions: input.servConfigured && canPersist,
  };
}

export function isResponseCurrent(responseId: number, latestRequestId: number) {
  return responseId === latestRequestId;
}
