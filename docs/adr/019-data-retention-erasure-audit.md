# ADR-019 — Data Retention, Erasure & Immutable Records

Status: Accepted

## Context

Slotnova must support personal-data rights while retaining financial/audit records where legally or operationally required. Naive hard deletion conflicts with append-only audit and immutable transaction history.

## Decision

Define retention by record class before real production PII. Separate optional profile/contact data from financial/audit facts. Where deletion is required but a record must remain, pseudonymize personal identifiers while preserving required transactional integrity and auditability. Audit/event payloads minimize PII from the outset.

## Consequences

Requires explicit data-classification and erasure workflows before production. Avoids retrofitting pseudonymization across financial/audit history later.
