# Contract — `application/problem+json` (RFC 9457)

The single error shape for every Slotnova API response that is not a success (FR-037, ADR-013). The frontend renders errors from this shape only and never sees server-internal detail (FR-035).

## Media type

`Content-Type: application/problem+json`

## Shape

```
{
  "type": "https://slotnova.app/problems/<slug>",   // stable, dereferenceable identifier
  "title": "<short, stable, human-readable summary>", // does not change per-occurrence
  "status": <http status code>,                       // matches the response status
  "detail": "<human-readable, safe explanation of this occurrence>",
  "instance": "https://slotnova.app/requests/<request-id>", // correlation id (FR-054)
  // optional, problem-specific members:
  "errors": [ { "path": "email", "message": "must be a valid email" } ], // validation only
  "requiredCapability": "members:invite",             // authorization problems only
  "checks": { "database": "down" }                    // readiness problems only
}
```

## Rules

- `type` is a stable slug per failure class — clients branch on `type`, never on `detail` or `title` text.
- `detail` never contains stack traces, SQL, internal identifiers, or PII.
- `status` in the body always equals the HTTP status line.
- `instance` always carries the request correlation id so a user-reported error is traceable in logs.
- 5xx problems use a generic `type`/`detail` (`.../problems/internal`) and rely on `instance` + server logs for diagnosis.
- Every new failure class adds a documented `type` slug; contract tests assert the shape for changed endpoints (FR-037).

## Phase 1 problem catalogue (initial)

| `type` slug | HTTP | Used by |
|---|---|---|
| `validation` | 400 | any endpoint, malformed input (with `errors[]`) |
| `invalid-credentials` | 401 | `POST /v1/auth/session` |
| `session-invalid` | 401 | any authenticated endpoint |
| `user-disabled` | 403 | `POST /v1/auth/session` |
| `forbidden` | 403 | authorization failures (with `requiredCapability`) |
| `email-mismatch` | 403 | invitation acceptance |
| `not-a-member` | 403 | workspace switch |
| `not-ready` | 503 | `GET /readyz` (with `checks`) |
| `invitation-not-found` | 404 | invitation preview |
| `invitation-expired` | 410 | invitation preview / acceptance |
| `invitation-exists` | 409 | invitation issue |
| `already-member` | 409 | invitation issue / acceptance |
| `workspace-unavailable` | 409 | workspace switch |
| `rate-limited` | 429 | auth, invitation preview |
| `internal` | 500 | unhandled server error (generic) |

## Acceptance

- A forced error on every Phase 1 endpoint returns a body that validates against the `problem+json` schema (contract test).
- The generated client exposes `type` as a discriminant so the SPA can map problems to system-state UI (FR-018) without parsing prose.
