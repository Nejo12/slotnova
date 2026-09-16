/**
 * ServiceCategory invariants (data-model.md "ServiceCategory", `research.md`
 * R-CAT). Deliberately narrow: name + sort order only — no nesting, icons,
 * descriptions, or taxonomy framework (Founder-finalized).
 */
export interface ServiceCategoryCreateInput {
  readonly name: string;
  readonly sortOrder?: number | undefined;
}

export class InvalidServiceCategoryNameError extends Error {
  override readonly name = "InvalidServiceCategoryNameError";
  constructor() {
    super("service category name must not be blank");
  }
}

export class InvalidServiceCategorySortOrderError extends Error {
  override readonly name = "InvalidServiceCategorySortOrderError";
  constructor(readonly sortOrder: number) {
    super(`service category sort_order must be an integer, got ${sortOrder}`);
  }
}

export function assertValidServiceCategoryCreateInput(input: ServiceCategoryCreateInput): void {
  if (input.name.trim().length === 0) throw new InvalidServiceCategoryNameError();
  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) {
    throw new InvalidServiceCategorySortOrderError(input.sortOrder);
  }
}
