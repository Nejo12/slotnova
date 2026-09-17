/**
 * `catalog.services` access. Every method runs against a transaction that
 * already has `app.workspace_id` set (RLS-scoped by construction, ADR-008)
 * — this repository issues no unscoped query, and exposes no
 * `findAll()`/cross-workspace lookup (issue #58).
 *
 * Cross-workspace category association is rejected at the database level
 * (`services_category_workspace_fkey` in `packages/db/migrations/
 * 0006_catalog.sql`, mirroring the `invitations_invited_by_workspace_fkey`
 * precedent in `0002_identity.sql`) — a bare `category_id` FK would only
 * prove the referenced category exists *somewhere*, not that it belongs to
 * this service's workspace. `assertCategoryBelongsToWorkspace` below is a
 * defense-in-depth application check that surfaces a clear domain error
 * before the write is attempted; the database constraint is the actual
 * correctness boundary (constitution II).
 */
import { Injectable } from "@nestjs/common";
import type { Queryable } from "@slotnova/db";

import type { WorkspaceId } from "../../../identity/index.js";
import type { Money } from "../../domain/money.js";
import type { ServiceCategoryId, ServiceId } from "../../domain/ids.js";

export interface ServiceRecord {
  readonly id: ServiceId;
  readonly workspaceId: WorkspaceId;
  readonly categoryId: ServiceCategoryId | null;
  readonly name: string;
  readonly durationMinutes: number;
  readonly preBufferMinutes: number;
  readonly postBufferMinutes: number;
  readonly price: Money;
  readonly active: boolean;
}

interface ServiceRow {
  id: string;
  workspace_id: string;
  category_id: string | null;
  name: string;
  duration_minutes: number;
  pre_buffer_minutes: number;
  post_buffer_minutes: number;
  price_amount_minor: string;
  price_currency: string;
  active: boolean;
}

function toRecord(row: ServiceRow): ServiceRecord {
  return {
    id: row.id as ServiceId,
    workspaceId: row.workspace_id as WorkspaceId,
    categoryId: row.category_id as ServiceCategoryId | null,
    name: row.name,
    durationMinutes: row.duration_minutes,
    preBufferMinutes: row.pre_buffer_minutes,
    postBufferMinutes: row.post_buffer_minutes,
    price: { amountMinor: Number(row.price_amount_minor), currency: row.price_currency },
    active: row.active,
  };
}

const SELECT = `
  SELECT id, workspace_id, category_id, name, duration_minutes, pre_buffer_minutes,
         post_buffer_minutes, price_amount_minor, price_currency, active
    FROM public.services`;

export class ServiceCategoryNotInWorkspaceError extends Error {
  override readonly name = "ServiceCategoryNotInWorkspaceError";
  constructor(readonly categoryId: ServiceCategoryId) {
    super(`category ${categoryId} does not belong to the active workspace`);
  }
}

/**
 * No service with that id is visible in the active workspace. RLS makes
 * "does not exist" and "belongs to another workspace" indistinguishable by
 * construction, so this single error covers both — there is deliberately no
 * separate cross-workspace error that a caller could use to probe for the
 * existence of another tenant's data (`contracts/catalog.contract.md`).
 */
export class ServiceNotFoundError extends Error {
  override readonly name = "ServiceNotFoundError";
  constructor(readonly serviceId: ServiceId) {
    super(`service ${serviceId} was not found in the active workspace`);
  }
}

export interface ServiceCreateRow {
  readonly workspaceId: WorkspaceId;
  readonly categoryId?: ServiceCategoryId | null | undefined;
  readonly name: string;
  readonly durationMinutes: number;
  readonly preBufferMinutes: number;
  readonly postBufferMinutes: number;
  readonly price: Money;
}

export interface ServiceListQuery {
  /** Omitted: both active and inactive services. */
  readonly active?: boolean | undefined;
  /** Exclusive keyset cursor — the last `id` of the previous page. */
  readonly cursor?: ServiceId | undefined;
  /** Always supplied by the caller; this repository never pages unbounded. */
  readonly limit: number;
}

export interface ServiceUpdateFields {
  readonly name?: string | undefined;
  readonly categoryId?: ServiceCategoryId | null | undefined;
  readonly durationMinutes?: number | undefined;
  readonly preBufferMinutes?: number | undefined;
  readonly postBufferMinutes?: number | undefined;
  readonly price?: Money | undefined;
  readonly active?: boolean | undefined;
}

@Injectable()
export class ServicesRepository {
  /**
   * Defense-in-depth check ahead of the database constraint: the RLS-scoped
   * `findById` on `ServiceCategoriesRepository` returns `null` for a
   * category that exists but belongs to another workspace (RLS makes it
   * indistinguishable from nonexistent), so this simply requires the
   * lookup to have succeeded under the same transaction context.
   */
  assertCategoryResolved(categoryId: ServiceCategoryId, resolved: unknown): void {
    if (resolved === null || resolved === undefined) {
      throw new ServiceCategoryNotInWorkspaceError(categoryId);
    }
  }

  async create(tx: Queryable, input: ServiceCreateRow): Promise<ServiceRecord> {
    const { rows } = await tx.query(
      `INSERT INTO public.services
         (workspace_id, category_id, name, duration_minutes, pre_buffer_minutes,
          post_buffer_minutes, price_amount_minor, price_currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, workspace_id, category_id, name, duration_minutes, pre_buffer_minutes,
                 post_buffer_minutes, price_amount_minor, price_currency, active`,
      [
        input.workspaceId,
        input.categoryId ?? null,
        input.name,
        input.durationMinutes,
        input.preBufferMinutes,
        input.postBufferMinutes,
        input.price.amountMinor,
        input.price.currency,
      ],
    );
    return toRecord(rows[0] as ServiceRow);
  }

  /**
   * Workspace-scoped keyset page (PR-02, `contracts/catalog.contract.md`
   * "pagination cursor"). NOT an unrestricted `findAll()`: it is bounded by
   * `limit`, and like every other method here it can only ever see the rows
   * RLS exposes for the transaction's active `app.workspace_id` (issue #58).
   *
   * Keyset on `id` rather than `OFFSET`, matching the only cursor convention
   * this repository already has (`identity/application/maintenance.ts`,
   * `apps/worker/src/outbox/claim.ts` both page `WHERE id > $cursor ORDER BY
   * id`). `id` is a total order and never changes, so a page boundary cannot
   * shift or duplicate a row when another row is inserted or updated
   * mid-pagination — which `OFFSET` cannot promise.
   */
  async list(tx: Queryable, query: ServiceListQuery): Promise<ServiceRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (query.active !== undefined) {
      conditions.push(`active = $${i++}`);
      params.push(query.active);
    }
    if (query.cursor !== undefined) {
      conditions.push(`id > $${i++}`);
      params.push(query.cursor);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";
    params.push(query.limit);

    const { rows } = await tx.query(`${SELECT}${where} ORDER BY id ASC LIMIT $${i}`, params);
    return (rows as ServiceRow[]).map(toRecord);
  }

  async findById(tx: Queryable, id: ServiceId): Promise<ServiceRecord | null> {
    const { rows } = await tx.query(`${SELECT} WHERE id = $1`, [id]);
    const row = rows[0] as ServiceRow | undefined;
    return row ? toRecord(row) : null;
  }

  /** Applies only the fields present in `fields`; omitted fields are left unchanged. */
  async update(tx: Queryable, id: ServiceId, fields: ServiceUpdateFields): Promise<ServiceRecord> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (fields.name !== undefined) {
      sets.push(`name = $${i++}`);
      params.push(fields.name);
    }
    if (fields.categoryId !== undefined) {
      sets.push(`category_id = $${i++}`);
      params.push(fields.categoryId);
    }
    if (fields.durationMinutes !== undefined) {
      sets.push(`duration_minutes = $${i++}`);
      params.push(fields.durationMinutes);
    }
    if (fields.preBufferMinutes !== undefined) {
      sets.push(`pre_buffer_minutes = $${i++}`);
      params.push(fields.preBufferMinutes);
    }
    if (fields.postBufferMinutes !== undefined) {
      sets.push(`post_buffer_minutes = $${i++}`);
      params.push(fields.postBufferMinutes);
    }
    if (fields.price !== undefined) {
      sets.push(`price_amount_minor = $${i++}`);
      params.push(fields.price.amountMinor);
      sets.push(`price_currency = $${i++}`);
      params.push(fields.price.currency);
    }
    if (fields.active !== undefined) {
      sets.push(`active = $${i++}`);
      params.push(fields.active);
    }

    if (sets.length === 0) {
      const existing = await this.findById(tx, id);
      if (!existing) throw new ServiceNotFoundError(id);
      return existing;
    }

    sets.push(`updated_at = now()`);
    params.push(id);

    const { rows } = await tx.query(
      `UPDATE public.services SET ${sets.join(", ")}
        WHERE id = $${i}
        RETURNING id, workspace_id, category_id, name, duration_minutes, pre_buffer_minutes,
                  post_buffer_minutes, price_amount_minor, price_currency, active`,
      params,
    );
    const row = rows[0] as ServiceRow | undefined;
    if (!row) throw new ServiceNotFoundError(id);
    return toRecord(row);
  }

  async deactivate(tx: Queryable, id: ServiceId): Promise<ServiceRecord> {
    return this.update(tx, id, { active: false });
  }
}
