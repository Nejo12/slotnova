/**
 * Heavy-lane pre-merge time budget check (task T089).
 *
 * The mechanism is complete and ready to enforce, but the budget VALUE is
 * deliberately not chosen here -- per the issue's founder gate, no
 * heavy-lane budget may be silently selected. `budgetSeconds` is `null`
 * until the founder approves a number from an actual observed GitHub
 * Actions heavy-lane run (see docs/runbooks/perf-baselines.md), at which
 * point the approved value is recorded in
 * docs/standards/ci-quality-gates.md and this script is wired into CI to
 * enforce it.
 */

export interface HeavyLaneBudgetResult {
  withinBudget: boolean | null;
  message: string;
}

export function checkHeavyLaneBudget(
  observedSeconds: number,
  budgetSeconds: number | null,
): HeavyLaneBudgetResult {
  if (budgetSeconds === null) {
    return {
      withinBudget: null,
      message:
        "no founder-approved heavy-lane budget recorded yet " +
        "(docs/standards/ci-quality-gates.md) -- this check is inert until one is set.",
    };
  }
  const withinBudget = observedSeconds <= budgetSeconds;
  return {
    withinBudget,
    message: withinBudget
      ? `observed heavy-lane duration ${observedSeconds}s is within the ${budgetSeconds}s budget.`
      : `observed heavy-lane duration ${observedSeconds}s exceeds the ${budgetSeconds}s budget.`,
  };
}
