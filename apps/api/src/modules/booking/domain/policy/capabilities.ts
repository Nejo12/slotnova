/**
 * Booking capability strings (`contracts/booking.contract.md`, FR-028:
 * "Booking read/create/edit/cancel/complete each require an explicit
 * capability"; issue #73).
 *
 * Owned by `booking`, not by `identity`'s `capabilities.ts` — that file is
 * explicitly scoped to "Phase-1 protected-foundation-action" capabilities,
 * and a module's own protected actions are its own vocabulary. `identity`
 * only needs to *compare* the string (`authorize()` takes a plain
 * `requiredCapability: string`), so nothing here creates a dependency in that
 * direction. Same shape as `catalog/domain/policy/capabilities.ts` and
 * `scheduling/domain/policy/capabilities.ts`.
 *
 * Deliberately FIVE, exactly as the contract gates the five actions —
 * cancelling and completing are different consequences with different
 * audiences, so they are not folded into one `booking:manage`. There is no
 * `booking:confirm`: creation lands directly at `confirmed` and no `/confirm`
 * endpoint exists (`contracts/booking.contract.md` "Not part of Phase 2"),
 * and no `booking:delete`: a Booking is never deleted, only cancelled.
 *
 * NOTE (Founder decision, deliberately NOT made in PR-07): which membership
 * roles receive these capabilities by default is a product-policy question no
 * accepted artifact answers, so `identity`'s `DEFAULT_ROLE_PERMISSIONS` is
 * left untouched — exactly as PR-02 and PR-04 left the identical
 * `catalog:*`/`scheduling:*` mappings open. Enforcement is complete and
 * server-authoritative; granting is done by writing the capability onto a
 * membership's `permissions`, which is what this module's tests do
 * explicitly. Inventing a role mapping would be product policy this PR was
 * not asked to decide.
 */
export const BOOKING_READ = "booking:read";
export const BOOKING_CREATE = "booking:create";
export const BOOKING_EDIT = "booking:edit";
export const BOOKING_CANCEL = "booking:cancel";
export const BOOKING_COMPLETE = "booking:complete";

export const BOOKING_CAPABILITIES = [
  BOOKING_READ,
  BOOKING_CREATE,
  BOOKING_EDIT,
  BOOKING_CANCEL,
  BOOKING_COMPLETE,
] as const;

export type BookingCapability = (typeof BOOKING_CAPABILITIES)[number];
