/**
 * The project-owned `createZodDto` (issue #79).
 *
 * Every HTTP boundary schema in this API declares its DTO through THIS module
 * rather than importing `createZodDto` straight from `nestjs-zod`, because the
 * unpatched path renders a bare nullable scalar as an ARRAY of that scalar.
 *
 * ## The defect, proven from the two libraries' own code
 *
 * 1. Zod 4's `toJSONSchema()` emits a bare `z.string().nullable()` (a nullable
 *    scalar carrying NO sibling constraints) in JSON Schema's compact
 *    multi-type form: `{ type: ["string", "null"] }`. A nullable value that
 *    DOES carry a sibling constraint -- `z.uuid().nullable()`, or a nullable
 *    object -- is instead emitted as `{ anyOf: [ ..., { type: "null" } ] }`.
 *    That is the entire difference between the fields that render correctly
 *    today and the fields that do not.
 *
 * 2. `nestjs-zod`'s `openApiMetadataFactory` hands each TOP-LEVEL property of
 *    a DTO's JSON Schema to `@nestjs/swagger` as that property's
 *    `_OPENAPI_METADATA_FACTORY` metadata, verbatim -- `type` included.
 *
 * 3. `@nestjs/swagger`'s `SchemaObjectFactory.mergePropertyWithMetadata`
 *    branches on `Array.isArray(metadata.type)` and calls
 *    `createFromNestedArray`, because in `@nestjs/swagger`'s OWN decorator
 *    vocabulary `@ApiProperty({ type: [String] })` means "array of String".
 *    `createFromNestedArray` returns `{ type: "array", items: recurse(type[0]) }`
 *    -- it keeps only element `[0]` and discards everything else, including
 *    the `"null"` member and every nestjs-zod marker key on that property.
 *
 * JSON Schema's "one of these types" and `@nestjs/swagger`'s "array of this
 * type" are two different conventions that share one spelling, and the
 * compact form walks straight into the collision. Nested schemas never do,
 * because `@nestjs/swagger` only scans a DTO's top-level properties and
 * copies anything deeper through untouched -- which is exactly why
 * `BookingListResponseDto_Output`'s nested `cancelledReason` was always right
 * while `BookingResponseDto_Output`'s top-level one was always wrong.
 *
 * Because `createFromNestedArray` drops the marker keys, a mangled nullable
 * scalar and a genuine `z.array(z.string())` are byte-identical by the time
 * the document exists. The correction therefore CANNOT be a post-pass over
 * the generated document; it has to happen before `@nestjs/swagger` sees the
 * metadata. That is what this module does, and it is why
 * `apps/api/openapi/openapi.json` is never hand-edited.
 *
 * The normalisation is a pure de-sugaring: the compact `["string", "null"]`
 * form is rewritten into the OpenAPI 3.0 `{ type: "string", nullable: true }`
 * form -- the identical shape `nestjs-zod` already produces for every nullable
 * that took the `anyOf` route, and the correct form for the `openapi: 3.0.0`
 * document this API publishes (`generate-openapi.ts`). No runtime validation,
 * serialisation or endpoint behaviour is touched: `ZodValidationPipe` and
 * `ZodSerializerInterceptor` read `schema`, which is untouched.
 */
import { createZodDto as createNestZodDto } from "nestjs-zod";

/**
 * The `openapi` version `generate-openapi.ts` publishes. `nullable: true` is
 * the OpenAPI 3.0 spelling of nullability; 3.1 restores JSON Schema's own
 * `type: [T, "null"]` and would need no de-sugaring at all. The guard test in
 * `__tests__/zod-dto.test.ts` fails if the document version ever moves, so
 * this assumption cannot rot silently.
 */
const OPENAPI_MAJOR_MINOR = "3.0";

type JsonValue = unknown;
type JsonObject = Record<string, JsonValue>;

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rewrites every JSON Schema compact multi-type `type` array into the
 * OpenAPI 3.0 nullable-scalar form, at any depth.
 *
 * Generic by construction: it keys off the SHAPE of `type` and nothing else --
 * never a property name, never a DTO name, never an endpoint. Sibling
 * keywords (`format`, `enum`, `minLength`, `readOnly`, ...) are preserved as
 * they are, and optionality is untouched: optionality lives in the parent
 * object's `required` list, which this function never reads or writes.
 *
 * A `type` that is already a scalar string -- including a genuine
 * `{ type: "array", items: ... }` -- is returned structurally unchanged.
 *
 * A multi-type array with more than one non-`null` member is not something
 * any current boundary schema produces, and silently passing it through would
 * re-arm exactly the collision above, so it throws instead of guessing.
 */
export function normalizeNullableScalarTypes<T>(schema: T): T {
  return walk(schema) as T;
}

function walk(node: JsonValue): JsonValue {
  if (Array.isArray(node)) return node.map(walk);
  if (!isJsonObject(node)) return node;

  // Every value is walked, `type` included: the node handed to this function
  // may be a schema OR a properties RECORD, and a record can legitimately hold
  // a property literally named `type` (RFC 9457's `ProblemDetailsDto.type` is
  // one). Walking a `type` whose value is a string or an array of strings is a
  // no-op, so there is nothing to gain by special-casing the key and a latent
  // blind spot to gain by doing so.
  const normalized: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    normalized[key] = walk(value);
  }

  const type = normalized["type"];
  if (!Array.isArray(type)) return normalized;

  const members = type.filter((member): member is string => typeof member === "string");
  if (members.length !== type.length) return normalized;

  const nullable = members.includes("null");
  const concrete = members.filter((member) => member !== "null");
  if (concrete.length !== 1) {
    throw new Error(
      `[zod-dto] Unsupported JSON Schema multi-type \`type: ${JSON.stringify(type)}\`. ` +
        `Only a single non-null type is representable as an OpenAPI ${OPENAPI_MAJOR_MINOR} ` +
        `nullable value; express a wider union with an explicit \`anyOf\` schema instead.`,
    );
  }

  normalized["type"] = concrete[0];
  if (nullable) normalized["nullable"] = true;
  return normalized;
}

interface OpenApiMetadataCarrier {
  _OPENAPI_METADATA_FACTORY?: () => unknown;
}

function patchMetadataFactory(target: object): void {
  const original = (target as OpenApiMetadataCarrier)._OPENAPI_METADATA_FACTORY;
  if (typeof original !== "function") return;
  Object.defineProperty(target, "_OPENAPI_METADATA_FACTORY", {
    configurable: true,
    writable: true,
    enumerable: false,
    value: function patchedOpenApiMetadataFactory(this: unknown): unknown {
      return normalizeNullableScalarTypes(original.call(this));
    },
  });
}

/**
 * `nestjs-zod` exposes the response DTO through a `Output` GETTER that mints a
 * fresh class on every access, so the getter itself is wrapped rather than a
 * one-time snapshot of its result. `this` is forwarded because the getter
 * derives the `_Output` class name from it.
 */
function patchDto(dto: object): void {
  patchMetadataFactory(dto);

  const descriptor = Object.getOwnPropertyDescriptor(dto, "Output");
  const getOutput = descriptor?.get;
  if (!getOutput) return;

  Object.defineProperty(dto, "Output", {
    configurable: true,
    enumerable: descriptor.enumerable === true,
    get: function patchedOutput(this: unknown): unknown {
      const output: unknown = getOutput.call(this);
      if (typeof output === "function") patchMetadataFactory(output);
      return output;
    },
  });
}

/**
 * Drop-in replacement for `nestjs-zod`'s `createZodDto` — same schema, same
 * runtime parsing, same DTO class — whose OpenAPI metadata cannot be mangled
 * by the type-array collision documented at the top of this file.
 */
export function createZodDto<TSchema extends Parameters<typeof createNestZodDto>[0]>(
  schema: TSchema,
): ReturnType<typeof createNestZodDto<TSchema>> {
  const dto = createNestZodDto(schema);
  patchDto(dto);
  return dto;
}
