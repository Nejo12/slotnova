# ADR-009 — Authorization Model

Status: Proposed

## Context

UI visibility is not an authorization boundary. Slotnova needs explicit workspace-scoped roles and permissions that can evolve without trusting external identity-provider claims.

## Decision

Slotnova owns `membership`, `role` and `permission` data. Server-side policy functions authorize use cases using authenticated user + active workspace + membership + permission context. UI permissions mirror server capability but never replace it. Sensitive actions are audited.

## Consequences

Requires a small policy layer and exhaustive role/action tests. Enables clear least-privilege behavior and future custom roles without coupling authorization to an auth vendor.
