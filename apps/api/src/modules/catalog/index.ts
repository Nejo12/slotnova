/**
 * `catalog` module public entry point — ports/types only, mirroring
 * `identity/index.ts`'s convention. Never import `catalog/infrastructure/**`
 * from another module (enforced by `no-cross-module-internals`); widen this
 * file instead when a real consumer appears.
 *
 * PR-07 (issue #73) is that first real consumer: Booking snapshots a
 * Service's duration/buffers at creation time, so {@link ServiceSnapshotPort}
 * — and only it — is published here. Still ports/types only: no repository,
 * no `ServiceRecord`, no write use case is exported, and the port itself
 * exposes the five-member snapshot and nothing more.
 */
export { ServiceSnapshotPort, type ServiceSnapshot } from "./application/service-snapshot.port.js";

export {
  asServiceCategoryId,
  asServiceId,
  type ServiceCategoryId,
  type ServiceId,
} from "./domain/ids.js";
