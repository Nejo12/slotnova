import { NotFoundException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { runWithContext } from "@slotnova/observability-server";
import { describe, expect, it, vi } from "vitest";

import type { ProblemDetails } from "../problem-types.js";
import { ProblemException } from "../problem.exception.js";
import { ProblemExceptionFilter } from "../problem.filter.js";

function fakeHost(): { host: ArgumentsHost; sent: () => { status: number; body: ProblemDetails } } {
  let capturedStatus = 0;
  let capturedBody: ProblemDetails | undefined;
  const reply = {
    status: vi.fn().mockImplementation((code: number) => {
      capturedStatus = code;
      return reply;
    }),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockImplementation((body: ProblemDetails) => {
      capturedBody = body;
      return reply;
    }),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    sent: () => {
      if (capturedBody === undefined) throw new Error("reply.send was never called");
      return { status: capturedStatus, body: capturedBody };
    },
  };
}

describe("ProblemExceptionFilter", () => {
  it("renders a ProblemException with its catalogue slug, status and instance", () => {
    const filter = new ProblemExceptionFilter();
    const { host, sent } = fakeHost();

    runWithContext({ correlationId: "req-abc123" }, () => {
      filter.catch(new ProblemException("not-a-member"), host);
    });

    const { status, body } = sent();
    expect(status).toBe(403);
    expect(body.type).toBe("https://slotnova.app/problems/not-a-member");
    expect(body.status).toBe(403);
    expect(body.instance).toBe("https://slotnova.app/requests/req-abc123");
  });

  it("carries problem-specific members (requiredCapability) through", () => {
    const filter = new ProblemExceptionFilter();
    const { host, sent } = fakeHost();

    filter.catch(new ProblemException("forbidden", { requiredCapability: "members:invite" }), host);

    expect(sent().body.requiredCapability).toBe("members:invite");
  });

  it("normalizes a bare Nest HttpException to a fallback slug for its status", () => {
    const filter = new ProblemExceptionFilter();
    const { host, sent } = fakeHost();

    filter.catch(new NotFoundException("Cannot GET /nope"), host);

    const { status, body } = sent();
    expect(status).toBe(404);
    expect(body.type).toBe("https://slotnova.app/problems/not-found");
    expect(body.detail).toBe("Cannot GET /nope");
  });

  it("normalizes an unexpected non-HttpException throwable to a generic 500 with no leaked detail", () => {
    const filter = new ProblemExceptionFilter();
    const { host, sent } = fakeHost();

    filter.catch(new Error("password=hunter2 at /internal/secret.ts:42"), host);

    const { status, body } = sent();
    expect(status).toBe(500);
    expect(body.type).toBe("https://slotnova.app/problems/internal");
    expect(body.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("always sets the problem+json content type", () => {
    const filter = new ProblemExceptionFilter();
    const { host } = fakeHost();
    const reply = host.switchToHttp().getResponse<{ header: ReturnType<typeof vi.fn> }>();

    filter.catch(new ProblemException("internal"), host);

    expect(reply.header).toHaveBeenCalledWith("content-type", "application/problem+json");
  });
});
