/**
 * Money validation for Catalog `Service.price` (ADR-015, data-model.md).
 *
 * Slotnova's money model is integer minor units + ISO-4217 currency — never
 * floating point (constitution IV, AGENTS.md hard prohibition). No shared
 * `packages/money` exists yet (Phase 1 introduced no money-bearing entity);
 * Catalog is the first module to need currency validation, so this stays
 * local to `catalog/domain` rather than speculatively extracted into a new
 * shared package before a second consumer demonstrates the need (rule of
 * three, constitution VI). Booking/Payments reuse this through Catalog's
 * application port once they exist, not by duplicating it.
 *
 * Only currency *validity* and minor-unit *exponent* are needed for Phase 2
 * PR-01 (storing a price) — no arithmetic, allocation, tax, or rounding
 * behavior is implemented here; ADR-015 reserves that for the phase that
 * actually performs money arithmetic (Payments).
 */

/**
 * ISO-4217 currencies Slotnova recognises today, with their minor-unit
 * exponent. Deliberately a curated allowlist, not the full ISO-4217 table —
 * an unrecognised code is rejected rather than silently assumed to have 2
 * decimal places, which would be an unannounced correctness assumption for
 * a currency this list doesn't actually support yet. Extend this list (not
 * the validation logic) when a new currency is genuinely needed.
 */
const CURRENCY_MINOR_UNIT_EXPONENTS: Readonly<Record<string, number>> = {
  USD: 2,
  GBP: 2,
  EUR: 2,
  CAD: 2,
  AUD: 2,
  NZD: 2,
  CHF: 2,
  JPY: 0,
  KRW: 0,
  BHD: 3,
  KWD: 3,
  OMR: 3,
};

export function isValidCurrencyCode(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNIT_EXPONENTS, value);
}

export function minorUnitExponent(currency: string): number {
  const exponent = CURRENCY_MINOR_UNIT_EXPONENTS[currency];
  if (exponent === undefined) throw new InvalidCurrencyError(currency);
  return exponent;
}

export class InvalidCurrencyError extends Error {
  override readonly name = "InvalidCurrencyError";

  constructor(readonly value: string) {
    super(`"${value}" is not a recognised ISO-4217 currency code`);
  }
}

export class InvalidMoneyAmountError extends Error {
  override readonly name = "InvalidMoneyAmountError";

  constructor(readonly amountMinor: number) {
    super(`price amount must be an integer minor-unit value >= 0, got ${amountMinor}`);
  }
}

export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

/** Validates a `{ amountMinor, currency }` pair. Throws on the first violation. */
export function assertValidMoney(value: Money): void {
  if (!isValidCurrencyCode(value.currency)) {
    throw new InvalidCurrencyError(value.currency);
  }
  if (!Number.isInteger(value.amountMinor) || value.amountMinor < 0) {
    throw new InvalidMoneyAmountError(value.amountMinor);
  }
}
