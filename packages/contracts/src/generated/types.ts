// GENERATED FILE -- DO NOT EDIT. Run `pnpm --filter @slotnova/contracts contracts:generate`.
// Source: apps/api/openapi/openapi.json (task T064). See task T065 /
// docs/decisions/0004-validation-contract-integration.md.

export interface paths {
  "/healthz": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["HealthController_healthz"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/readyz": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["HealthController_readyz"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/auth/csrf": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["CsrfController_bootstrap"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/auth/session": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["SessionController_signIn"];
    delete: operations["SessionController_signOut"];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/me": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["MeController_me"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/auth/session/workspace": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["WorkspaceContextController_switchWorkspace"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/invitations": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["InvitationsController_issue"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/invitations/{token}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["InvitationsController_preview"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/invitations/{token}/acceptance": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations["InvitationsController_accept"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/invitations/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["InvitationsController_revoke"];
    trace?: never;
  };
  "/v1/catalog/services": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["ServicesController_list"];
    put?: never;
    post: operations["ServicesController_create"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/catalog/services/{id}": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["ServicesController_detail"];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch: operations["ServicesController_update"];
    trace?: never;
  };
  "/v1/catalog/categories": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations["ServiceCategoriesController_list"];
    put?: never;
    post: operations["ServiceCategoriesController_create"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/scheduling/availability-patterns": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List this workspace's availability patterns
     * @description Returned as a list to allow effective-dated pattern history. Ordered oldest effective window first; effective windows never overlap, so at most one pattern applies to any given date.
     */
    get: operations["SchedulingController_list"];
    put?: never;
    /**
     * Create an availability pattern
     * @description `effectiveUntil` is EXCLUSIVE: `2026-10-01` produces no availability on 2026-10-01. The effective window must not overlap an existing pattern's.
     */
    post: operations["SchedulingController_createAvailabilityPattern"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/scheduling/availability-exceptions": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Create a time-off exception
     * @description Always resolved instants — `[startsAt, endsAt)`, half-open, never a recurring rule. An exception always subtracts from the recurring pattern for its overlapping span.
     */
    post: operations["SchedulingController_createAvailabilityException"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  "/v1/scheduling/availability/resolve": {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Resolve availability over a bounded date range
     * @description Pure computation — persists nothing. Expands the effective recurring pattern(s) over the half-open local-date window `[from, to)`, subtracts overlapping exceptions, and returns normalised half-open UTC instant intervals. The window may not exceed 370 days.
     */
    post: operations["SchedulingController_resolve"];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    SignInRequestDto: {
      credential: {
        [key: string]: unknown;
      };
    };
    SignInResponseDto_Output: {
      user: {
        id: string;
        displayName: string;
        email: string;
      };
      activeWorkspace: {
        id: string;
        name: string;
        role: string;
      } | null;
      readonly workspaces: {
        id: string;
        name: string;
        role: string;
      }[];
    };
    MeResponseDto_Output: {
      user: {
        id: string;
        displayName: string;
        email: string;
      };
      activeWorkspace: {
        id: string;
        name: string;
        role: string;
        readonly permissions: string[];
      } | null;
      readonly workspaces: {
        id: string;
        name: string;
        role: string;
      }[];
      session: {
        expiresAt: string;
      };
    };
    WorkspaceSwitchRequestDto: {
      /** Format: uuid */
      workspaceId: string;
    };
    IssueInvitationRequestDto: {
      /** Format: email */
      email: string;
      /** @enum {string} */
      role: "admin" | "manager" | "staff";
    };
    IssueInvitationResponseDto_Output: {
      invitation: {
        id: string;
        email: string;
        role: string;
        status: string;
        expiresAt: string;
      };
      token?: string;
    };
    InvitationPreviewResponseDto_Output: {
      workspaceName: string;
      role: string;
      email: string;
      status: string;
      expiresAt: string;
    };
    RevokeInvitationRequestDto: {
      /** @enum {string} */
      status: "revoked";
    };
    ServiceListResponseDto_Output: {
      items: {
        id: string;
        name: string;
        categoryId: string | null;
        durationMinutes: number;
        preBufferMinutes: number;
        postBufferMinutes: number;
        priceAmountMinor: number;
        priceCurrency: string;
        active: boolean;
      }[];
      nextCursor: string[];
    };
    ServiceResponseDto_Output: {
      id: string;
      name: string;
      categoryId: string[];
      durationMinutes: number;
      preBufferMinutes: number;
      postBufferMinutes: number;
      priceAmountMinor: number;
      priceCurrency: string;
      active: boolean;
    };
    CreateServiceRequestDto: {
      name: string;
      /** Format: uuid */
      categoryId?: string;
      durationMinutes: number;
      preBufferMinutes?: number;
      postBufferMinutes?: number;
      priceAmountMinor: number;
      priceCurrency: string;
    };
    UpdateServiceRequestDto: {
      name?: string;
      /** Format: uuid */
      categoryId?: string | null;
      durationMinutes?: number;
      preBufferMinutes?: number;
      postBufferMinutes?: number;
      priceAmountMinor?: number;
      priceCurrency?: string;
      active?: boolean;
    };
    ServiceCategoryListResponseDto_Output: {
      items: {
        id: string;
        name: string;
        sortOrder: number;
      }[];
    };
    CreateServiceCategoryRequestDto: {
      name: string;
      sortOrder?: number;
    };
    ServiceCategoryResponseDto_Output: {
      id: string;
      name: string;
      sortOrder: number;
    };
    AvailabilityPatternListResponseDto_Output: {
      items: {
        id: string;
        timezone: string;
        weeklyRule: {
          /** @enum {number} */
          dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7;
          startMinuteOfDay: number;
          endMinuteOfDay: number;
        }[];
        effectiveFrom: string | null;
        effectiveUntil: string | null;
      }[];
    };
    CreateAvailabilityPatternRequestDto: {
      timezone: string;
      weeklyRule: {
        /** @enum {number} */
        dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7;
        startMinuteOfDay: number;
        endMinuteOfDay: number;
      }[];
      effectiveFrom?: string;
      effectiveUntil?: string;
    };
    AvailabilityPatternResponseDto_Output: {
      id: string;
      timezone: string;
      weeklyRule: {
        /** @enum {number} */
        dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7;
        startMinuteOfDay: number;
        endMinuteOfDay: number;
      }[];
      effectiveFrom: string[];
      effectiveUntil: string[];
    };
    CreateAvailabilityExceptionRequestDto: {
      startsAt: string;
      endsAt: string;
      reason?: string;
    };
    AvailabilityExceptionResponseDto_Output: {
      id: string;
      startsAt: string;
      endsAt: string;
      reason: string[];
    };
    ResolveAvailabilityRequestDto: {
      from: string;
      to: string;
    };
    ResolveAvailabilityResponseDto_Output: {
      intervals: {
        start: string;
        end: string;
      }[];
    };
    ProblemDetailsDto: {
      type: string;
      title: string;
      status: number;
      detail?: string;
      instance?: string;
      readonly errors?: {
        path: string;
        message: string;
      }[];
      requiredCapability?: string;
      checks?: {
        [key: string]: string;
      };
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  HealthController_healthz: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  HealthController_readyz: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description All dependencies are reachable (`ready`). */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description A dependency is unreachable/degraded (`not-ready`, with `checks`). */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  CsrfController_bootstrap: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  SessionController_signIn: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["SignInRequestDto"];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["SignInResponseDto_Output"];
        };
      };
      /** @description Malformed body (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Adapter rejected the credential (`invalid-credentials`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description User exists but is disabled (`user-disabled`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Authentication attempts are rate limited. */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  SessionController_signOut: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
    };
  };
  MeController_me: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MeResponseDto_Output"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  WorkspaceContextController_switchWorkspace: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["WorkspaceSwitchRequestDto"];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MeResponseDto_Output"];
        };
      };
      /** @description Malformed body (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No active membership in the target workspace (`not-a-member`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Target workspace or membership is suspended (`workspace-unavailable`). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  InvitationsController_issue: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["IssueInvitationRequestDto"];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["IssueInvitationResponseDto_Output"];
        };
      };
      /** @description Bad email/role, or `role: owner` (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `members:invite`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description A pending invitation already exists for that email (`invitation-exists`), or the email already maps to an active membership (`already-member`). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  InvitationsController_preview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        token: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["InvitationPreviewResponseDto_Output"];
        };
      };
      /** @description Unknown/garbage/revoked token (`invitation-not-found`). */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Expired or already-used token (`invitation-expired`). */
      410: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Too many requests for this token/IP (`rate-limited`). */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  InvitationsController_accept: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        token: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["MeResponseDto_Output"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Signed-in user's email does not match the invitation (`email-mismatch`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description User is already a member (`already-member`). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Expired, already-used, or revoked token (`invitation-expired`). */
      410: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  InvitationsController_revoke: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["RevokeInvitationRequestDto"];
      };
    };
    responses: {
      /** @description Malformed id/body (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `members:invite`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No pending invitation with that id in the active workspace (`not-found`). */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  ServicesController_list: {
    parameters: {
      query?: {
        limit?: number;
        cursor?: string;
        active?: "true" | "false";
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceListResponseDto_Output"];
        };
      };
      /** @description Malformed query parameter (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `catalog:read`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  ServicesController_create: {
    parameters: {
      query?: never;
      header: {
        /** @description Client-supplied replay key. Retrying with the same key and the same body returns the original 201 response and creates no second service; the same key with a materially different body is a 409 conflict. */
        "Idempotency-Key": string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateServiceRequestDto"];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceResponseDto_Output"];
        };
      };
      /** @description Malformed body, unknown property, or missing `Idempotency-Key` (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `catalog:manage`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description `Idempotency-Key` reused with a different request (`idempotency-conflict`). */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Duration/buffer/price/currency invariant violated, or an unavailable category (`validation`). */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  ServicesController_detail: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceResponseDto_Output"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `catalog:read`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No such service in the active workspace (`not-found`). A service belonging to another workspace is indistinguishable from one that does not exist. */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  ServicesController_update: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["UpdateServiceRequestDto"];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceResponseDto_Output"];
        };
      };
      /** @description Malformed body or unknown property (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `catalog:manage`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No such service in the active workspace (`not-found`). */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Duration/buffer/price/currency invariant violated, or an unavailable category (`validation`). */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  ServiceCategoriesController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceCategoryListResponseDto_Output"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `catalog:read`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  ServiceCategoriesController_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateServiceCategoryRequestDto"];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ServiceCategoryResponseDto_Output"];
        };
      };
      /** @description Malformed body or unknown property (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `catalog:manage`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Blank name or non-integer sort order (`validation`). */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  SchedulingController_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AvailabilityPatternListResponseDto_Output"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `scheduling:read`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  SchedulingController_createAvailabilityPattern: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateAvailabilityPatternRequestDto"];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AvailabilityPatternResponseDto_Output"];
        };
      };
      /** @description Malformed body or unknown property (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `scheduling:manage`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Invalid IANA timezone, weekly rules overlapping within a day, an inverted effective window, or an effective window overlapping an existing pattern (`validation`). */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  SchedulingController_createAvailabilityException: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["CreateAvailabilityExceptionRequestDto"];
      };
    };
    responses: {
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["AvailabilityExceptionResponseDto_Output"];
        };
      };
      /** @description Malformed body or unknown property (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `scheduling:manage`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description `startsAt` is not strictly before `endsAt` (`validation`). */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
  SchedulingController_resolve: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        "application/json": components["schemas"]["ResolveAvailabilityRequestDto"];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/json": components["schemas"]["ResolveAvailabilityResponseDto_Output"];
        };
      };
      /** @description Malformed body or unknown property (`validation`). */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description No/invalid session (`session-invalid`). */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description Missing `scheduling:read`, or no active workspace (`forbidden`). */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
      /** @description `from` is not strictly before `to`, or the window exceeds 370 days (`validation`). */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          "application/problem+json": components["schemas"]["ProblemDetailsDto"];
        };
      };
    };
  };
}
