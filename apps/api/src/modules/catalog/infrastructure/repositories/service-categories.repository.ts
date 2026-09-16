/**
 * `catalog.service_categories` access. Every method runs against a
 * transaction that already has `app.workspace_id` set (RLS-scoped by
 * construction, ADR-008) — this repository issues no unscoped query, and
 * exposes no `findAll()`/cross-workspace lookup (data-model.md "Tenant
 * context contract"; issue #58: "DO NOT expose unrestricted findAll()").
 */
import { Injectable } from "@nestjs/common";
import type { Queryable } from "@slotnova/db";

import type { WorkspaceId } from "../../../identity/index.js";
import type { ServiceCategoryId } from "../../domain/ids.js";

export interface ServiceCategoryRecord {
  readonly id: ServiceCategoryId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly sortOrder: number;
}

interface ServiceCategoryRow {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
}

function toRecord(row: ServiceCategoryRow): ServiceCategoryRecord {
  return {
    id: row.id as ServiceCategoryId,
    workspaceId: row.workspace_id as WorkspaceId,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

const SELECT = `SELECT id, workspace_id, name, sort_order FROM public.service_categories`;

@Injectable()
export class ServiceCategoriesRepository {
  async create(
    tx: Queryable,
    input: { workspaceId: WorkspaceId; name: string; sortOrder?: number | undefined },
  ): Promise<ServiceCategoryRecord> {
    const { rows } = await tx.query(
      `INSERT INTO public.service_categories (workspace_id, name, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, workspace_id, name, sort_order`,
      [input.workspaceId, input.name, input.sortOrder ?? 0],
    );
    return toRecord(rows[0] as ServiceCategoryRow);
  }

  /** Scoped by the transaction's active RLS context — never cross-workspace. */
  async findById(tx: Queryable, id: ServiceCategoryId): Promise<ServiceCategoryRecord | null> {
    const { rows } = await tx.query(`${SELECT} WHERE id = $1`, [id]);
    const row = rows[0] as ServiceCategoryRow | undefined;
    return row ? toRecord(row) : null;
  }
}
