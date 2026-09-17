/**
 * `/v1/catalog/categories` (`contracts/catalog.contract.md`, PR-02).
 *
 * Two endpoints only — list and create. No update, delete, nesting, icon or
 * description surface exists anywhere in this file: `research.md` R-CAT is
 * Founder-finalized on categories being name + sort order and nothing more.
 *
 * `POST` is not idempotency-keyed: the contract requires `Idempotency-Key`
 * for `POST /catalog/services` only, and categories impose no
 * workspace-uniqueness that a duplicate would violate
 * (`create-service-category.use-case.ts`). Adding replay semantics here
 * would be inventing contract this PR was not given.
 */
import { Body, Controller, Get, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBody, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { ZodResponse } from "nestjs-zod";
import type { FastifyRequest } from "fastify";

import { ProblemDetailsDto } from "../../../http/problem/problem-details.schema.js";
import { ZodValidationPipe } from "../../../http/validation/zod-validation.js";
import { CapabilityGuard, RequireCapability } from "../../identity/index.js";
import { CreateServiceCategoryUseCase } from "../application/create-service-category.use-case.js";
import { ListServiceCategoriesUseCase } from "../application/read-catalog.use-case.js";
import { CATALOG_MANAGE, CATALOG_READ } from "../domain/policy/capabilities.js";
import { CatalogProblemFilter } from "./catalog-problem.filter.js";
import { requireWorkspaceContext, toServiceCategoryResponse } from "./catalog-view.js";
import {
  CreateServiceCategoryRequestDto,
  ServiceCategoryListResponseDto,
  ServiceCategoryResponseDto,
  type CreateServiceCategoryRequestBody,
  type ServiceCategoryListResponseBody,
  type ServiceCategoryResponseBody,
} from "./catalog.schema.js";

const PROBLEM_JSON_CONTENT = {
  "application/problem+json": { schema: { $ref: getSchemaPath(ProblemDetailsDto) } },
};

@Controller("v1/catalog/categories")
@UseFilters(CatalogProblemFilter)
export class ServiceCategoriesController {
  constructor(
    private readonly listCategories: ListServiceCategoriesUseCase,
    private readonly createCategory: CreateServiceCategoryUseCase,
  ) {}

  @Get()
  @UseGuards(CapabilityGuard)
  @RequireCapability(CATALOG_READ)
  @ZodResponse({ status: 200, type: ServiceCategoryListResponseDto })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `catalog:read`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async list(@Req() request: FastifyRequest): Promise<ServiceCategoryListResponseBody> {
    const context = requireWorkspaceContext(request);
    const categories = await this.listCategories.execute(context);
    return { items: categories.map(toServiceCategoryResponse) };
  }

  @Post()
  @UseGuards(CapabilityGuard)
  @RequireCapability(CATALOG_MANAGE)
  @ApiBody({ type: CreateServiceCategoryRequestDto })
  @ZodResponse({ status: 201, type: ServiceCategoryResponseDto })
  @ApiResponse({
    status: 400,
    description: "Malformed body or unknown property (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 401,
    description: "No/invalid session (`session-invalid`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 403,
    description: "Missing `catalog:manage`, or no active workspace (`forbidden`).",
    content: PROBLEM_JSON_CONTENT,
  })
  @ApiResponse({
    status: 422,
    description: "Blank name or non-integer sort order (`validation`).",
    content: PROBLEM_JSON_CONTENT,
  })
  async create(
    @Body(new ZodValidationPipe(CreateServiceCategoryRequestDto))
    body: CreateServiceCategoryRequestBody,
    @Req() request: FastifyRequest,
  ): Promise<ServiceCategoryResponseBody> {
    const context = requireWorkspaceContext(request);
    const created = await this.createCategory.execute(context, {
      name: body.name,
      sortOrder: body.sortOrder,
    });
    return toServiceCategoryResponse(created);
  }
}
