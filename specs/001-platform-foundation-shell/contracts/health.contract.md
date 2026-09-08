# Contract — Health & Readiness

Exercises the full boundary-schema → OpenAPI → generated-client path with the simplest possible surface (FR-039).

## `GET /healthz` — liveness

- **Auth**: none. **State-changing**: no.
- **200** `application/json`:
  ```
  { "status": "ok", "service": "api", "time": "<RFC3339 timestamp>" }
  ```
- Never touches the database. Used by the platform's liveness probe.

## `GET /readyz` — readiness

- **Auth**: none. **State-changing**: no.
- **200** `application/json` when all dependencies are reachable:
  ```
  {
    "status": "ready",
    "checks": {
      "database": "ok",
      "migrations": "current",
      "outbox": "ok"
    },
    "time": "<RFC3339 timestamp>"
  }
  ```
- **503** `application/problem+json` (`type: ".../problems/not-ready"`) when any check fails, with a `checks` member showing which dependency is degraded. Body still conforms to `problem+json`.
- `migrations: "current"` means the applied schema version matches the code's expected version — a mismatch (app ahead of DB, or DB ahead of app during an expand/contract deploy) is reported, not hidden.

## Acceptance

- Both endpoints appear in the generated OpenAPI document.
- The generated typed client can call both and receives fully typed responses.
- `readyz` returns `503` + `problem+json` when the database is stopped (integration test).
