/**
 * `@slotnova/testing/msw/deny-network` — global HTTP/fetch egress guard (task T086).
 *
 * MSW's `onUnhandledRequest: "error"` (see `./node.ts`) only protects test
 * files that opt into an MSW server. This module is the second, mandatory
 * layer: it patches global `fetch` and Node's `http`/`https` request path so
 * that *any* outbound HTTP(S) call to a non-local host fails immediately and
 * loudly, whether or not the calling code goes through MSW at all.
 *
 * Deliberately scoped to HTTP(S)/fetch only — the transport every real
 * provider SDK (Stripe, Twilio, SendGrid, Slack, AWS SDK v3, etc.) uses.
 * Raw TCP (the `pg` driver talking to a Testcontainers PostgreSQL instance,
 * or Docker's own socket) is untouched, so real-PostgreSQL integration tests
 * keep working unmodified.
 */

import { createRequire } from "node:module";

import type * as HttpTypes from "node:http";
import type * as HttpsTypes from "node:https";

// `import * as http from "node:http"` yields an immutable ESM namespace
// object -- even though its property descriptors report `writable: true`,
// Node refuses actual assignment/redefinition on it. Go through
// `createRequire` to get the real, mutable CJS module object instead, which
// is what every consumer (including MSW's own node interceptors) ultimately
// patches too. Types are imported separately (`import type`) since the
// `require`d value is untyped.
const require = createRequire(import.meta.url);
const http = require("node:http") as typeof HttpTypes;
const https = require("node:https") as typeof HttpsTypes;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class NetworkDenylistError extends Error {
  constructor(host: string) {
    super(
      `NetworkDenylistError: blocked outbound HTTP(S) request to non-local host "${host}". ` +
        "Ordinary test runs must not make real external-provider calls -- mock this " +
        "call with MSW (see @slotnova/testing/msw/node), or if this is genuinely " +
        "local infrastructure, confirm the host is 127.0.0.1/localhost.",
    );
    this.name = "NetworkDenylistError";
  }
}

function hostFromUrlLike(input: string | URL): string {
  const url = typeof input === "string" ? new URL(input, "http://localhost") : input;
  return url.hostname;
}

function assertLocalHost(host: string): void {
  if (!LOCAL_HOSTS.has(host)) {
    throw new NetworkDenylistError(host);
  }
}

export interface NetworkDenylistHandle {
  restore(): void;
}

/**
 * Patch global `fetch`, `http.request`/`http.get`, and `https.request`/
 * `https.get` to reject any call whose target host is not 127.0.0.1,
 * localhost, or ::1. Call `.restore()` to undo.
 */
export function installNetworkDenylist(): NetworkDenylistHandle {
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = input instanceof Request ? input.url : input;
    assertLocalHost(hostFromUrlLike(target as string | URL));
    return originalFetch(input, init);
  }) as typeof fetch;

  function guardedRequest<T extends typeof http.request | typeof https.request>(original: T): T {
    return ((...args: Parameters<T>) => {
      const [first] = args;
      let host: string;
      if (typeof first === "string" || first instanceof URL) {
        host = hostFromUrlLike(first);
      } else {
        host =
          (first as HttpTypes.RequestOptions).hostname ??
          (first as HttpTypes.RequestOptions).host ??
          "localhost";
      }
      assertLocalHost(host);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forwarding original call signature
      return (original as any)(...args);
    }) as T;
  }

  http.request = guardedRequest(originalHttpRequest);
  http.get = guardedRequest(originalHttpGet);
  https.request = guardedRequest(originalHttpsRequest);
  https.get = guardedRequest(originalHttpsGet);

  return {
    restore(): void {
      globalThis.fetch = originalFetch;
      http.request = originalHttpRequest;
      http.get = originalHttpGet;
      https.request = originalHttpsRequest;
      https.get = originalHttpsGet;
    },
  };
}
