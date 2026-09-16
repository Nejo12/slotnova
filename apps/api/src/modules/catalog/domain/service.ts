/**
 * Service invariants (data-model.md "Service", FR-001, spec.md Founder
 * decisions). Pure validation — no persistence, no NestJS coupling — so it
 * is trivially unit-testable and reusable from both create and update paths.
 *
 * Deliberately narrow: only the Phase-2 PR-01 approved fields. No discounts,
 * tax, pricing tiers, deposits, add-ons, or duration overrides (issue #58 —
 * "do not invent"). `categoryId` is optional and its cross-workspace
 * validity is enforced at the repository/database layer
 * (`infrastructure/repositories/services.repository.ts`), not here — this
 * module has no database access and cannot check which workspace a category
 * belongs to.
 */
import { assertValidMoney, type Money } from "./money.js";
import type { ServiceCategoryId } from "./ids.js";

export interface ServiceCreateInput {
  readonly name: string;
  readonly categoryId?: ServiceCategoryId | undefined;
  readonly durationMinutes: number;
  readonly preBufferMinutes?: number | undefined;
  readonly postBufferMinutes?: number | undefined;
  readonly price: Money;
}

/**
 * Fields an ordinary update may change. `active` is included here rather
 * than behind a separate lifecycle framework — issue #58: "do not invent a
 * separate lifecycle framework" for reactivation, so toggling `active` is
 * just another field update. `DeactivateServiceUseCase`
 * (`application/deactivate-service.use-case.ts`) is a thin convenience over
 * the same path with `active: false`.
 */
export interface ServiceUpdateInput {
  readonly name?: string | undefined;
  readonly categoryId?: ServiceCategoryId | null | undefined;
  readonly durationMinutes?: number | undefined;
  readonly preBufferMinutes?: number | undefined;
  readonly postBufferMinutes?: number | undefined;
  readonly price?: Money | undefined;
  readonly active?: boolean | undefined;
}

export class InvalidServiceNameError extends Error {
  override readonly name = "InvalidServiceNameError";
  constructor() {
    super("service name must not be blank");
  }
}

export class InvalidServiceDurationError extends Error {
  override readonly name = "InvalidServiceDurationError";
  constructor(readonly durationMinutes: number) {
    super(`service duration_minutes must be an integer >= 1, got ${durationMinutes}`);
  }
}

export class InvalidServiceBufferError extends Error {
  override readonly name = "InvalidServiceBufferError";
  constructor(
    readonly field: "preBufferMinutes" | "postBufferMinutes",
    readonly value: number,
  ) {
    super(`service ${field} must be an integer >= 0, got ${value}`);
  }
}

function assertValidName(name: string): void {
  if (name.trim().length === 0) throw new InvalidServiceNameError();
}

function assertValidDuration(durationMinutes: number): void {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new InvalidServiceDurationError(durationMinutes);
  }
}

function assertValidBuffer(field: "preBufferMinutes" | "postBufferMinutes", value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidServiceBufferError(field, value);
  }
}

/** Validates a full creation input. Throws the first violation encountered. */
export function assertValidServiceCreateInput(input: ServiceCreateInput): void {
  assertValidName(input.name);
  assertValidDuration(input.durationMinutes);
  assertValidBuffer("preBufferMinutes", input.preBufferMinutes ?? 0);
  assertValidBuffer("postBufferMinutes", input.postBufferMinutes ?? 0);
  assertValidMoney(input.price);
}

/**
 * Validates only the fields present on a partial update — an update that
 * omits `durationMinutes` is not asserting "duration is now undefined", it
 * is leaving it unchanged, so absent fields are not validated here (the
 * repository re-reads the persisted row for anything not supplied).
 */
export function assertValidServiceUpdateInput(input: ServiceUpdateInput): void {
  if (input.name !== undefined) assertValidName(input.name);
  if (input.durationMinutes !== undefined) assertValidDuration(input.durationMinutes);
  if (input.preBufferMinutes !== undefined) {
    assertValidBuffer("preBufferMinutes", input.preBufferMinutes);
  }
  if (input.postBufferMinutes !== undefined) {
    assertValidBuffer("postBufferMinutes", input.postBufferMinutes);
  }
  if (input.price !== undefined) assertValidMoney(input.price);
}
