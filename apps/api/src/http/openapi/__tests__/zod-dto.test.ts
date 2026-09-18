/**
 * Regression proof for issue #79 — nullable scalar OpenAPI generation.
 *
 * Two layers, deliberately:
 *
 * 1. A LIVE generation-boundary matrix. A throwaway DTO + controller is run
 *    through the exact pipeline `src/scripts/generate-openapi.ts` uses
 *    (`SwaggerModule.createDocument` -> `cleanupOpenApiDoc`), so the assertions
 *    are about what the generator actually emits, not about a re-derivation of
 *    what it ought to emit. This is the layer that localises the bug: before
 *    the fix, `nullableString` came out as `{ type: "array", items: { type:
 *    "string" } }`.
 *
 * 2. Assertions against the COMMITTED `apps/api/openapi/openapi.json` for every
 *    real field the defect touched, following the precedent set by
 *    `src/http/problem/__tests__/problem-openapi-coverage.test.ts`. `pnpm
 *    contracts:check` already proves that document is never stale relative to
 *    source, so these are assertions against the shipped contract itself.
 *
 * Neither layer snapshots the whole document: each asserts the narrow schema
 * nodes at issue.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ZodResponse, cleanupOpenApiDoc } from "nestjs-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createZodDto, normalizeNullableScalarTypes } from "../zod-dto.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPENAPI_DOCUMENT_PATH = resolve(__dirname, "../../../../openapi/openapi.json");

type SchemaNode = Record<string, unknown>;

interface GeneratedDocument {
  openapi: string;
  components?: { schemas?: Record<string, SchemaNode> };
}

function loadCommittedDocument(): GeneratedDocument {
  return JSON.parse(readFileSync(OPENAPI_DOCUMENT_PATH, "utf8")) as GeneratedDocument;
}

/** `Components.schemas[schemaName].properties[propertyName]` of the committed document. */
function committedProperty(schemaName: string, propertyName: string): SchemaNode {
  const schema = loadCommittedDocument().components?.schemas?.[schemaName];
  expect(schema, `expected a committed schema named ${schemaName}`).toBeDefined();
  const properties = (schema as { properties?: Record<string, SchemaNode> }).properties;
  const property = properties?.[propertyName];
  expect(
    property,
    `expected ${schemaName}.${propertyName} in the committed document`,
  ).toBeDefined();
  return property as SchemaNode;
}

/**
 * The full nullability/optionality/array matrix in one schema, so a single
 * generation run proves every case and every case is proved against the same
 * code path. Every member is a BARE scalar where relevant: it is precisely the
 * absence of sibling constraints that makes Zod emit JSON Schema's compact
 * `type: [T, "null"]` form, which is the form the defect mangled.
 */
const matrixSchema = z.object({
  nullableString: z.string().nullable(),
  optionalNullableString: z.string().nullable().optional(),
  nullableNumber: z.number().nullable(),
  nullableBoolean: z.boolean().nullable(),
  plainString: z.string(),
  optionalPlainString: z.string().optional(),
  genuineStringArray: z.array(z.string()),
  nullableConstrainedString: z.uuid().nullable(),
});
class MatrixResponseDto extends createZodDto(matrixSchema) {}

@Controller("matrix")
class MatrixController {
  @Get()
  @ZodResponse({ type: MatrixResponseDto })
  read(): z.infer<typeof matrixSchema> {
    throw new Error("never invoked: this controller exists only to be introspected");
  }
}

@Module({ controllers: [MatrixController] })
class MatrixModule {}

async function generateMatrixSchema(): Promise<{
  properties: Record<string, SchemaNode>;
  required: readonly string[];
}> {
  const app = await NestFactory.create<NestFastifyApplication>(MatrixModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, new DocumentBuilder().setVersion("0.0.0").build()),
  );
  await app.close();

  const schema = document.components?.schemas?.["MatrixResponseDto_Output"] as
    { properties?: Record<string, SchemaNode>; required?: string[] } | undefined;
  expect(schema, "expected the matrix DTO to reach components.schemas").toBeDefined();
  return { properties: schema?.properties ?? {}, required: schema?.required ?? [] };
}

describe("OpenAPI generation of nullable scalars (issue #79)", () => {
  it("renders every nullable scalar as a nullable SCALAR, never as an array", async () => {
    const { properties } = await generateMatrixSchema();

    expect(properties["nullableString"]).toEqual({ type: "string", nullable: true });
    expect(properties["optionalNullableString"]).toEqual({ type: "string", nullable: true });
    expect(properties["nullableNumber"]).toEqual({ type: "number", nullable: true });
    expect(properties["nullableBoolean"]).toEqual({ type: "boolean", nullable: true });

    for (const name of [
      "nullableString",
      "optionalNullableString",
      "nullableNumber",
      "nullableBoolean",
    ]) {
      expect(properties[name], `${name} must not be an array`).not.toHaveProperty("items");
      expect(properties[name]?.["type"]).not.toBe("array");
    }
  });

  it("leaves non-nullable scalars, genuine arrays and constrained nullables untouched", async () => {
    const { properties } = await generateMatrixSchema();

    expect(properties["plainString"]).toEqual({ type: "string" });
    expect(properties["optionalPlainString"]).toEqual({ type: "string" });
    expect(properties["genuineStringArray"]).toEqual({ type: "array", items: { type: "string" } });
    // Already correct before the fix (Zod emits `anyOf` once a sibling
    // constraint is present) and must stay correct after it.
    expect(properties["nullableConstrainedString"]).toMatchObject({
      type: "string",
      format: "uuid",
      nullable: true,
    });
  });

  it("keeps optionality independent of nullability", async () => {
    const { required } = await generateMatrixSchema();

    expect(required).toContain("nullableString");
    expect(required).toContain("plainString");
    expect(required).not.toContain("optionalNullableString");
    expect(required).not.toContain("optionalPlainString");
  });

  it("de-sugars compact multi-type nodes at any depth without touching real arrays", () => {
    expect(
      normalizeNullableScalarTypes({
        a: { type: ["string", "null"], minLength: 1 },
        b: { type: "array", items: { type: "string" } },
        c: { type: "object", properties: { d: { type: ["number", "null"] } } },
        e: { anyOf: [{ type: "string" }, { type: "null" }] },
      }),
    ).toEqual({
      a: { type: "string", nullable: true, minLength: 1 },
      b: { type: "array", items: { type: "string" } },
      c: { type: "object", properties: { d: { type: "number", nullable: true } } },
      e: { anyOf: [{ type: "string" }, { type: "null" }] },
    });
  });

  /**
   * The value handed to the normaliser is a properties RECORD, whose keys are
   * property names — and `type` is a legitimate property name (RFC 9457's
   * `ProblemDetailsDto.type`). Special-casing the key `type` would leave a
   * property so named permanently unnormalised.
   */
  it("normalises a property that is itself named `type`", () => {
    expect(normalizeNullableScalarTypes({ type: { type: ["string", "null"] } })).toEqual({
      type: { type: "string", nullable: true },
    });
  });

  it("refuses to guess at a wider multi-type union rather than silently mangling it", () => {
    expect(() => normalizeNullableScalarTypes({ type: ["string", "number"] })).toThrow(
      /Unsupported JSON Schema multi-type/,
    );
  });
});

describe("committed OpenAPI document — nullable scalar fields (issue #79)", () => {
  /**
   * `zod-dto.ts` de-sugars to the OpenAPI 3.0 `nullable: true` spelling. If the
   * published document ever moves to 3.1, that spelling becomes wrong (3.1
   * uses JSON Schema's own `type: [T, "null"]`) and this test is the tripwire.
   */
  it("is an OpenAPI 3.0 document, which is what `nullable: true` presumes", () => {
    expect(loadCommittedDocument().openapi.startsWith("3.0")).toBe(true);
  });

  it.each([
    ["BookingResponseDto_Output", "cancelledReason", "string"],
    ["ServiceListResponseDto_Output", "nextCursor", "string"],
    ["ServiceResponseDto_Output", "categoryId", "string"],
    ["AvailabilityPatternResponseDto_Output", "effectiveFrom", "string"],
    ["AvailabilityPatternResponseDto_Output", "effectiveUntil", "string"],
    ["AvailabilityExceptionResponseDto_Output", "reason", "string"],
  ])("%s.%s is a nullable scalar %s, not an array", (schemaName, propertyName, scalarType) => {
    const property = committedProperty(schemaName, propertyName);

    expect(property["type"]).toBe(scalarType);
    expect(property["nullable"]).toBe(true);
    expect(property).not.toHaveProperty("items");
  });

  it.each([
    ["BookingListResponseDto_Output", "items"],
    ["ServiceListResponseDto_Output", "items"],
    ["AvailabilityPatternResponseDto_Output", "weeklyRule"],
    ["ResolveAvailabilityResponseDto_Output", "intervals"],
    ["ProblemDetailsDto", "errors"],
  ])("%s.%s is a genuine array and stays one", (schemaName, propertyName) => {
    const property = committedProperty(schemaName, propertyName);

    expect(property["type"]).toBe("array");
    expect(property).toHaveProperty("items");
    expect(property["nullable"]).toBeUndefined();
  });

  it("keeps nested nullable scalars nullable too", () => {
    const items = committedProperty("BookingListResponseDto_Output", "items") as {
      items?: { properties?: Record<string, SchemaNode> };
    };
    expect(items.items?.properties?.["cancelledReason"]).toEqual({
      type: "string",
      nullable: true,
    });
  });
});
