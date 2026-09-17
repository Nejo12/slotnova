/**
 * Branded identifiers for the `scheduling` module (data-model.md
 * "opaque/branded" identifiers: `AvailabilityPatternId`,
 * `AvailabilityExceptionId`). Defined locally rather than shared with
 * `identity`/`catalog`'s equivalent — a tiny branding helper does not meet the
 * rule-of-three bar for extraction into a shared package (constitution VI),
 * and a shared type would be a needless cross-module dependency.
 */
declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type AvailabilityPatternId = Brand<string, "AvailabilityPatternId">;
export type AvailabilityExceptionId = Brand<string, "AvailabilityExceptionId">;

export const asAvailabilityPatternId = (value: string): AvailabilityPatternId =>
  value as AvailabilityPatternId;
export const asAvailabilityExceptionId = (value: string): AvailabilityExceptionId =>
  value as AvailabilityExceptionId;
