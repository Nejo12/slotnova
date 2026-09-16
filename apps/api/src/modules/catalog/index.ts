/**
 * `catalog` module public entry point — ports/types only, mirroring
 * `identity/index.ts`'s convention. Nothing cross-module needs a Catalog
 * concept yet (Booking's Service reference is PR-05+), so this currently
 * exports only the branded ids; widen it, never import
 * `catalog/infrastructure/**` directly, when a real consumer appears
 * (enforced by `no-cross-module-internals`).
 */
export {
  asServiceCategoryId,
  asServiceId,
  type ServiceCategoryId,
  type ServiceId,
} from "./domain/ids.js";
