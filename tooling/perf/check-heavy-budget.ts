/**
 * Heavy-lane pre-merge time budget check (task T089).
 *
 * `checkHeavyLaneBudget` is the pure decision function (unchanged shape and
 * behavior since it was first written, including the `budgetSeconds: null`
 * case -- kept as a generic "no budget supplied" contract, exercised by its
 * own tests). `HEAVY_LANE_BUDGET_SECONDS` below is the founder-approved
 * value: 180 seconds (3 minutes), approved against the observed 93-second
 * `heavy.yml` GitHub Actions run on PR #53
 * (head 218cf73095d5ef21c1da27ea4a973c9151f023bf, run 35119891244). See
 * docs/runbooks/perf-baselines.md and
 * docs/standards/ci-quality-gates.md for the recorded baseline/approval.
 *
 * This is a Phase-1 baseline budget, not a permanent ceiling -- see
 * docs/standards/ci-quality-gates.md's "Heavy-lane pre-merge time budget"
 * section for when it must be deliberately revisited.
 *
 * `main()` below is the CLI entrypoint `.github/workflows/heavy.yml`'s
 * `budget-check` job invokes. It measures the actual workflow wall-clock
 * duration via the GitHub Actions REST API's `run_started_at` for the
 * current run (`GITHUB_RUN_ID`), never a hard-coded number and never a
 * single job's own runtime standing in for the workflow's total -- see
 * `measureElapsedSeconds` below.
 */

/** Founder-approved Phase-1 heavy-lane pre-merge budget, in seconds. */
export const HEAVY_LANE_BUDGET_SECONDS = 180;

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

interface GithubRunTiming {
  run_started_at: string;
}

/**
 * Query the GitHub Actions REST API for the current workflow run's own
 * `run_started_at` and return elapsed seconds from then to now. This is the
 * actual workflow wall-clock duration up to the moment this job runs -- not
 * any individual job's self-reported duration, and not an estimate. Since
 * this must run from a job gated with `needs:` on every other heavy-lane
 * job (see heavy.yml's `budget-check` job), "now" is a faithful proxy for
 * "when the heavy lane finished", modulo this job's own small
 * checkout/setup overhead, which only ever makes the measured duration a
 * slight overestimate -- never a false pass.
 */
export async function measureElapsedSeconds(env: {
  GITHUB_API_URL?: string | undefined;
  GITHUB_REPOSITORY?: string | undefined;
  GITHUB_RUN_ID?: string | undefined;
  GITHUB_TOKEN?: string | undefined;
}): Promise<number> {
  const apiUrl = env.GITHUB_API_URL ?? "https://api.github.com";
  const repo = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID;
  const token = env.GITHUB_TOKEN;
  if (!repo || !runId || !token) {
    throw new Error(
      "measureElapsedSeconds: missing GITHUB_REPOSITORY, GITHUB_RUN_ID, or GITHUB_TOKEN " +
        "-- this must run inside a GitHub Actions job.",
    );
  }

  const response = await fetch(`${apiUrl}/repos/${repo}/actions/runs/${runId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(
      `measureElapsedSeconds: GitHub API request failed (${response.status} ${response.statusText})`,
    );
  }
  const run = (await response.json()) as GithubRunTiming;
  const startedAtMs = Date.parse(run.run_started_at);
  if (Number.isNaN(startedAtMs)) {
    throw new Error(
      `measureElapsedSeconds: could not parse run_started_at "${run.run_started_at}"`,
    );
  }
  return Math.round((Date.now() - startedAtMs) / 1000);
}

async function main(): Promise<void> {
  const observedSeconds = await measureElapsedSeconds({
    GITHUB_API_URL: process.env["GITHUB_API_URL"],
    GITHUB_REPOSITORY: process.env["GITHUB_REPOSITORY"],
    GITHUB_RUN_ID: process.env["GITHUB_RUN_ID"],
    GITHUB_TOKEN: process.env["GITHUB_TOKEN"],
  });
  const result = checkHeavyLaneBudget(observedSeconds, HEAVY_LANE_BUDGET_SECONDS);
  console.log(result.message);
  if (result.withinBudget === false) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
