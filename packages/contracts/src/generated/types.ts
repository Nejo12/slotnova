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
}
