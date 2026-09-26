import { describe, expect, it } from "vitest";
import { reserveBudgetUnit } from "./run-budget";

describe("public run budget", () => {
  it("allows work through the limit and rejects the next weighted run", () => {
    const first = reserveBudgetUnit({ window: 7, units: 38, limit: 40 });
    expect(first.allowed).toBe(true);
    const second = reserveBudgetUnit({ previous: first.entry, window: 7, units: 2, limit: 40 });
    expect(second.allowed).toBe(true);
    expect(reserveBudgetUnit({ previous: second.entry, window: 7, units: 1, limit: 40 }).allowed).toBe(false);
  });

  it("starts fresh in a new window", () => {
    expect(reserveBudgetUnit({ previous: { window: 7, units: 40 }, window: 8, units: 2, limit: 40 })).toEqual({ allowed: true, entry: { window: 8, units: 2 } });
  });
});
