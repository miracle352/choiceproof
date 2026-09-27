import { describe, expect, it } from "vitest";
import { REFUND_CHALLENGE, REFUND_EXAMPLE, REFUND_SAMPLE_ANSWERS } from "./example";

describe("the public refund example", () => {
  it("changes only the request age from 4 days to 45 days", () => {
    expect(REFUND_CHALLENGE).toContain("45 days after arrival");
    expect(REFUND_CHALLENGE.replace("45 days", "4 days")).toBe(REFUND_EXAMPLE.input);
  });

  it("keeps every illustrative answer inside the configured vocabulary", () => {
    expect(REFUND_EXAMPLE.answers).toContain(REFUND_SAMPLE_ANSWERS.original);
    expect(REFUND_EXAMPLE.answers).toContain(REFUND_SAMPLE_ANSWERS.challenged);
  });
});
