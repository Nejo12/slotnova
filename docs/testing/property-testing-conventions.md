# Property-Testing Conventions

How Slotnova uses [fast-check](https://fast-check.dev) (ADR-006,
`docs/testing/strategy.md` §2, FR-047). Wiring lives in
`@slotnova/testing/property`.

This document is the convention layer. It deliberately defines **no**
domain-specific arbitraries — those arrive with the product phases that own the
rules (see [Future domain properties](#future-domain-properties)).

## Property tests vs example tests

Use an **example test** (plain Vitest) when:

- the behaviour is a specific, named case ("an expired invitation cannot be
  accepted")
- there is one obviously-right expected value
- the test doubles as documentation of a concrete scenario
- a regression test pins a previously-broken input (keep the exact input)

Use a **property test** when a rule must hold across a *space* of inputs and
examples cannot credibly cover it:

- an algebraic law — round-trip (`parse(format(x)) == x`), idempotence,
  commutativity, monotonicity
- an invariant that must survive every operation ("sum of allocations always
  equals the total", "no two confirmed bookings for one resource overlap")
- a relationship between two implementations (a simple reference model vs the
  real one)
- generating *illegal* input and asserting it is always rejected the same way

Rule of thumb: if you find yourself writing a `for` loop over hand-listed inputs,
or copy-pasting a test with tweaked numbers, it wants to be a property.

Property and example tests are complementary — a property proves the law, a
handful of example tests keep the concrete cases readable and pin regressions.

## Deterministic reproduction (seed + path)

fast-check picks a random seed per run and prints it on failure, together with
the shrink **path** and the minimal counterexample:

```
Property failed after 12 tests
{ seed: 1680032115, path: "11:2:1", endOnFailure: true }
Counterexample: [ -2147483648 ]
Shrunk 4 time(s)
```

(`endOnFailure: true` in that line is fast-check's own *fast-replay* hint — it
replays only the shrunk counterexample. Our runs leave `endOnFailure` off so a
fresh failure is always shrunk to a minimum.)

Reproduce it exactly by pinning the seed and path:

```ts
fc.assert(
  fc.property(fc.integer(), (n) => Math.abs(n) >= 0),
  propertyParameters({ seed: 1680032115, path: "11:2:1" }),
);
```

To pin an entire run (for `git bisect` or a flaky-hunt), set the environment
variable instead — `propertyParameters()` reads it:

```sh
SLOTNOVA_PROPERTY_SEED=1680032115 pnpm test
```

A property that fails only on some seeds is a **defect in the property or the
code**, never "acceptable flakiness" (FR-052). Fix it or, temporarily and with a
tracking issue, pin the seed and mark it.

When a real failure is found, add the shrunk counterexample as a dedicated
example test so the regression is pinned independently of fast-check.

## Shrinking

On failure fast-check **shrinks** — it searches for the smallest / simplest input
that still fails, so you debug `[0]` instead of `[938271, -4, 17, …]`. Keep
shrinking working:

- prefer built-in arbitraries and `.map()` / `.filter()` / `.chain()` over
  hand-rolled generators; the built-ins carry shrinkers
- avoid `.filter()` with a very low acceptance rate (it discards runs and weakens
  shrinking) — use `.map()` into the valid space instead
- do not `try/catch` inside the predicate and swallow the failure; let it throw
- leave `endOnFailure` off (the default here) so shrinking runs; only set it when
  you deliberately want the raw first counterexample

## Example counts in fast CI

The fast lane targets **under 3 minutes** (`docs/standards/ci-quality-gates.md`).
Property files are cheap only if example counts stay modest.

- default is `DEFAULT_PROPERTY_RUNS` (50) via `propertyParameters()` — do not
  raise it file-wide by habit
- tune per property: a pure O(1) law can afford `{ numRuns: 300 }`; a property
  whose predicate does real work should stay at 20–50
- for a deeper periodic sweep, raise everything at once without editing tests:
  `SLOTNOVA_PROPERTY_RUNS=1000 pnpm test` (run in a nightly/heavy job, not the
  fast lane)
- keep individual arbitraries bounded (`fc.string({ maxLength })`,
  `fc.array(arb, { maxLength })`, `fc.integer({ min, max })`) so a single run
  cannot blow up in size or time

## No sleeps, no wall-clock

Arbitrary sleeps are prohibited (FR-050, ADR-006, constitution IV/V). In property
tests specifically:

- a `setTimeout`/`sleep` in a predicate multiplies by `numRuns` and turns a
  1-second suite into minutes
- timing-based assertions ("resolved within 50 ms") are non-deterministic under
  CI load and shrink to nothing useful — they are flaky by construction
- never seed an arbitrary from `Date.now()` / `Math.random()` — that defeats
  seed reproduction
- inject time. Domain scheduling code takes an explicit clock/instant (ADR-010,
  "no raw JavaScript `Date` in domain scheduling code"); property tests generate
  the instant as an arbitrary and pass it in
- `propertyParameters({ timeoutMs })` exists only as a **hang guard** (fail a
  stuck predicate fast), never to wait for something

## When it must be a real-PostgreSQL test instead

A property test runs pure, in-process logic. It is **not** evidence for anything
the database enforces (FR-048, ADR-006, `docs/testing/strategy.md` §5–§6,
constitution II). Use `@slotnova/db/testing` with real PostgreSQL — not
fast-check, not a mock — when the behaviour under test depends on:

- row-level security / tenant-policy enforcement
- `EXCLUDE` / unique / check / foreign-key constraints (e.g. booking-overlap
  prevention, ADR-011)
- transaction isolation, locking, `SELECT … FOR UPDATE`, `SKIP LOCKED`
- migration correctness (clean apply, forward apply)
- outbox claim / job-scheduler claim semantics
- concurrency: two real connections racing for the same row (sequential loops
  are not concurrency tests — FR-046)

Property testing and real-PostgreSQL testing often pair up: use a property to
explore the *pure* interval/allocation algebra, and a real-PostgreSQL
concurrency test to prove the constraint actually holds under a race.

## Future domain properties

These are the invariant-heavy areas that will get property coverage in their
product phases (`docs/testing/strategy.md` §2). **None are implemented now** —
this section records the intended shape so the arbitraries land consistently.
Each becomes additional named exports of `@slotnova/testing/property`.

### Timezone / DST transitions (ADR-010, Scheduling)

- **Arbitraries**: IANA zone id; local date/time near a known DST boundary;
  duration.
- **Properties**: converting local → instant → local is identity *off*
  transitions; a "spring-forward" local time that does not exist is rejected or
  normalised deterministically (one documented rule), never silently shifted; a
  "fall-back" ambiguous local time resolves by the documented rule; adding a
  duration then subtracting it returns the original instant.
- **Must also** have real-PostgreSQL coverage where stored `timestamptz` / range
  behaviour is involved.

### Interval overlap & normalisation (ADR-011, Scheduling / Booking)

- **Arbitraries**: half-open interval `[start, end)` with `start < end`; sets of
  intervals.
- **Properties**: overlap is symmetric; touching-but-not-overlapping
  (`a.end == b.end_start`) is **not** an overlap (half-open); normalising a set
  of intervals produces disjoint, sorted, coalesced intervals covering exactly
  the same instants; normalisation is idempotent; a free/busy split partitions
  the day with no gap or double-count.
- **Pairs with**: a real-PostgreSQL `EXCLUDE` / range test proving the DB refuses
  an overlapping booking under concurrent writers.

### Allocation / invariant preservation (ADR-015, Payments)

- **Arbitraries**: total amount in integer minor units; a list of weights /
  shares; tax rate; refund amount ≤ paid.
- **Properties**: the sum of allocated parts equals the total exactly (no
  rounding leak); allocation is deterministic for the same input; the largest
  remainder goes to a documented, stable recipient; a refund never makes the net
  captured amount negative; splitting then re-summing is identity. All in integer
  minor units — never floating point (constitution IV).

### Illegal state transitions (ADR-016 Recovery, ADR-007 sessions, booking lifecycle)

- **Arbitraries**: current state; an event drawn from the *full* event alphabet
  (including events invalid for that state).
- **Properties**: applying an event not permitted from the current state is
  rejected and leaves the state unchanged (no partial mutation); every reachable
  state is reachable by some legal path; terminal states accept no further
  transitions; the first valid Recovery acceptance wins and competing offers
  close exactly once (hard product invariant) — the *pure* state machine part
  here, with the concurrency/attribution part proven against real PostgreSQL.
