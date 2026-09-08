# ADR-015 — Money, Tax & Allocation

Status: Accepted

## Context

Integer minor units prevent floating-point errors but do not define rounding, allocation, tax-inclusion or operation order. These choices affect every payment/refund total.

## Decision

Represent money as integer minor units plus ISO currency. Currency metadata determines minor-unit exponent. Proportional allocations use deterministic largest-remainder allocation so parts sum exactly to the original total. Tax treatment is explicit per price/tax jurisdiction; Phase 5 implementation must encode whether configured prices are tax-inclusive or tax-exclusive and the operation order for discount, tax and tip. Deposits/no-show fees are first-class monetary events with explicit tax treatment.

## Consequences

Requires centralized, well-tested money arithmetic and jurisdiction-aware tax configuration. Property tests prove allocation conservation and rounding invariants.
