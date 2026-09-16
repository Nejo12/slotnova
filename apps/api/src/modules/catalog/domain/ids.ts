/**
 * Branded identifiers for the `catalog` module (data-model.md "opaque/branded"
 * identifiers). Defined locally rather than shared with `identity`'s
 * equivalent (`identity/domain/ids.ts`) — two modules independently needing a
 * tiny branding helper does not meet the rule-of-three bar for extracting a
 * shared package (constitution VI), and a shared type would be a needless
 * cross-module dependency for something this small.
 */
declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

export type ServiceId = Brand<string, "ServiceId">;
export type ServiceCategoryId = Brand<string, "ServiceCategoryId">;

export const asServiceId = (value: string): ServiceId => value as ServiceId;
export const asServiceCategoryId = (value: string): ServiceCategoryId => value as ServiceCategoryId;
