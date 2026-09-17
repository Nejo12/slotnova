/**
 * Branded identifiers for the `booking` module (data-model.md
 * "opaque/branded" identifiers: `BookingId`). Defined locally rather than
 * shared with `identity`/`catalog`/`scheduling`'s equivalents — a tiny
 * branding helper does not meet the rule-of-three bar for extraction into a
 * shared package (constitution VI), and a shared type would be a needless
 * cross-module dependency.
 *
 * `ServiceReferenceId` is deliberately Booking's OWN brand rather than an
 * import of `catalog`'s `ServiceId`: data-model.md records the Booking ->
 * Service link as "by opaque id only", and importing Catalog's brand would
 * make a Catalog type part of Booking's domain vocabulary for no behavioural
 * gain. Booking never dereferences it.
 */
declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type BookingId = Brand<string, "BookingId">;
/** Opaque Catalog-owned service reference. Booking never resolves it. */
export type ServiceReferenceId = Brand<string, "ServiceReferenceId">;

export const asBookingId = (value: string): BookingId => value as BookingId;
export const asServiceReferenceId = (value: string): ServiceReferenceId =>
  value as ServiceReferenceId;
