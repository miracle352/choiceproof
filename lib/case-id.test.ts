import { describe, expect, it } from "vitest";
import { stableCaseId } from "./case-id";

describe("case submission identity", () => {
  it("deduplicates the same measured run pair without depending on a database migration", () => {
    const measured = { nodeId: "node-a", originalRunId: "run-1", challengedRunId: "run-2" };
    expect(stableCaseId(measured)).toBe(stableCaseId(measured));
    expect(stableCaseId(measured)).not.toBe(stableCaseId({ ...measured, challengedRunId: "run-3" }));
  });
});
