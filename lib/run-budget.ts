export type BudgetEntry = { window: number; units: number };

export function reserveBudgetUnit(input: { previous?: BudgetEntry; window: number; units: number; limit: number }) {
  const used = input.previous?.window === input.window ? input.previous.units : 0;
  if (used + input.units > input.limit) return { allowed: false as const, entry: input.previous };
  return { allowed: true as const, entry: { window: input.window, units: used + input.units } };
}
