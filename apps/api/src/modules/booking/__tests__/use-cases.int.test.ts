/**
 * Issue #68 (Phase 2 PR-05) — Booking application layer against real
 * PostgreSQL. Proves the state machine end to end through persistence: the
 * domain decides the transition, the repository's version-guarded UPDATE
 * performs it, and the two authorised same-command idempotent no-ops write
 * nothing at all.
 *
 * These are sequential proofs of the version guard. PR-06 owns the TRUE
 * concurrency proof (two independent connections racing the same row) and the
 * overlap exclusion constraint; nothing here pretends sequential calls are a
 * concurrency test.
 */
import { Temporal } from "@js-temporal/polyfill";
import { Client, Pool, runMigrations } from "@slotnova/db";
import { DEFAULT_POSTGRES_IMAGE, startPostgres, type PostgresHarness } from "@slotnova/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { WorkspaceContext } from "../../platform/tenancy/with-workspace-context.js";
import { CancelBookingUseCase } from "../application/cancel-booking.use-case.js";
import { CompleteBookingUseCase } from "../application/complete-booking.use-case.js";
import { CreateBookingUseCase } from "../application/create-booking.use-case.js";
import { RescheduleBookingUseCase } from "../application/reschedule-booking.use-case.js";
import {
  BookingNotFoundError,
  InvalidBookingDurationError,
  InvalidBookingTransitionError,
  StaleBookingVersionError,
} from "../domain/booking-errors.js";
import { asBookingId, asServiceReferenceId } from "../domain/ids.js";
import { BookingsRepository } from "../infrastructure/repositories/bookings.repository.js";

const SERVICE_ID = asServiceReferenceId("44444444-4444-4444-8444-444444444444");
const instant = (value: string): Temporal.Instant => Temporal.Instant.from(value);

describe("booking use cases (real PostgreSQL)", () => {
  let harness: PostgresHarness;
  let admin: Client;
  let pool: Pool;
  let create: CreateBookingUseCase;
  let reschedule: RescheduleBookingUseCase;
  let cancel: CancelBookingUseCase;
  let complete: CompleteBookingUseCase;

  async function seedWorkspace(label: string): Promise<WorkspaceContext> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO public.workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
      [`Booking uc ${label} ${suffix}`, `booking-uc-${label}-${suffix}`],
    );
    return { workspaceId: rows[0]!.id };
  }

  const confirm = (context: WorkspaceContext, startsAt = "2026-09-07T09:00:00Z") =>
    create.execute(context, {
      serviceId: SERVICE_ID,
      startsAt: instant(startsAt),
      serviceDurationMinutes: 60,
      preBufferMinutes: 15,
      postBufferMinutes: 10,
    });

  beforeAll(async () => {
    harness = await startPostgres({ image: DEFAULT_POSTGRES_IMAGE });
    await runMigrations({ connectionString: harness.adminUri });

    admin = new Client({ connectionString: harness.adminUri });
    await admin.connect();

    pool = new Pool({ connectionString: harness.appUri });
    const repository = new BookingsRepository();
    create = new CreateBookingUseCase(pool, repository);
    reschedule = new RescheduleBookingUseCase(pool, repository);
    cancel = new CancelBookingUseCase(pool, repository);
    complete = new CompleteBookingUseCase(pool, repository);
  }, 180_000);

  afterAll(async () => {
    await admin.end();
    await pool.end();
    await harness.stop();
  });

  it("creates a confirmed booking at version 1 with the generated blocking range", async () => {
    const context = await seedWorkspace("create");
    const booking = await confirm(context);

    expect(booking.status).toBe("confirmed");
    expect(booking.version).toBe(1);
    expect(booking.cancelledReason).toBeNull();
    expect(booking.blockingRangeStart.toString()).toBe("2026-09-07T08:45:00Z");
    expect(booking.blockingRangeEnd.toString()).toBe("2026-09-07T10:10:00Z");
    expect(booking.startsAt).toBeInstanceOf(Temporal.Instant);
  });

  it("rejects an invalid snapshot before any database work", async () => {
    const context = await seedWorkspace("invalid");
    await expect(
      create.execute(context, {
        serviceId: SERVICE_ID,
        startsAt: instant("2026-09-07T09:00:00Z"),
        serviceDurationMinutes: 0,
        preBufferMinutes: 0,
        postBufferMinutes: 0,
      }),
    ).rejects.toThrow(InvalidBookingDurationError);

    const { rows } = await admin.query(`SELECT id FROM public.bookings WHERE workspace_id = $1`, [
      context.workspaceId,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("walks confirmed -> rescheduled -> cancelled, incrementing the version each time", async () => {
    const context = await seedWorkspace("lifecycle");
    const booking = await confirm(context);

    const moved = await reschedule.execute(context, {
      bookingId: booking.id,
      expectedVersion: 1,
      startsAt: instant("2026-09-07T14:00:00Z"),
    });
    expect(moved.version).toBe(2);
    expect(moved.blockingRangeStart.toString()).toBe("2026-09-07T13:45:00Z");
    expect(moved.serviceDurationMinutes).toBe(60);

    const cancelled = await cancel.execute(context, {
      bookingId: booking.id,
      expectedVersion: 2,
      reason: "client called",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.version).toBe(3);
    expect(cancelled.cancelledReason).toBe("client called");
  });

  it("walks confirmed -> completed", async () => {
    const context = await seedWorkspace("completed");
    const booking = await confirm(context);
    const completed = await complete.execute(context, {
      bookingId: booking.id,
      expectedVersion: 1,
    });
    expect(completed.status).toBe("completed");
    expect(completed.version).toBe(2);
  });

  it("re-cancelling with the current version is a no-op that writes nothing", async () => {
    const context = await seedWorkspace("recancel");
    const booking = await confirm(context);
    const cancelled = await cancel.execute(context, {
      bookingId: booking.id,
      expectedVersion: 1,
      reason: "first reason",
    });

    const { rows: before } = await admin.query<{ updated_at: string }>(
      `SELECT to_json(updated_at) #>> '{}' AS updated_at FROM public.bookings WHERE id = $1`,
      [booking.id],
    );

    const again = await cancel.execute(context, {
      bookingId: booking.id,
      expectedVersion: 2,
      reason: "second reason",
    });
    expect(again.version).toBe(cancelled.version);
    expect(again.status).toBe("cancelled");
    expect(again.cancelledReason).toBe("first reason");

    const { rows: after } = await admin.query<{ updated_at: string }>(
      `SELECT to_json(updated_at) #>> '{}' AS updated_at FROM public.bookings WHERE id = $1`,
      [booking.id],
    );
    expect(after[0]!.updated_at).toBe(before[0]!.updated_at);
  });

  it("re-completing with the current version is a no-op that writes nothing", async () => {
    const context = await seedWorkspace("recomplete");
    const booking = await confirm(context);
    await complete.execute(context, { bookingId: booking.id, expectedVersion: 1 });

    const again = await complete.execute(context, { bookingId: booking.id, expectedVersion: 2 });
    expect(again.status).toBe("completed");
    expect(again.version).toBe(2);
  });

  it("rejects every other command on a terminal booking", async () => {
    const context = await seedWorkspace("terminal");

    const cancelledBooking = await confirm(context, "2026-09-08T09:00:00Z");
    await cancel.execute(context, {
      bookingId: cancelledBooking.id,
      expectedVersion: 1,
      reason: null,
    });
    await expect(
      reschedule.execute(context, {
        bookingId: cancelledBooking.id,
        expectedVersion: 2,
        startsAt: instant("2026-09-09T09:00:00Z"),
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
    await expect(
      complete.execute(context, { bookingId: cancelledBooking.id, expectedVersion: 2 }),
    ).rejects.toThrow(InvalidBookingTransitionError);

    const completedBooking = await confirm(context, "2026-09-10T09:00:00Z");
    await complete.execute(context, { bookingId: completedBooking.id, expectedVersion: 1 });
    await expect(
      reschedule.execute(context, {
        bookingId: completedBooking.id,
        expectedVersion: 2,
        startsAt: instant("2026-09-11T09:00:00Z"),
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
    await expect(
      cancel.execute(context, {
        bookingId: completedBooking.id,
        expectedVersion: 2,
        reason: "too late",
      }),
    ).rejects.toThrow(InvalidBookingTransitionError);
  });

  it("rejects a stale expectedVersion on every mutating command and changes nothing", async () => {
    const context = await seedWorkspace("stale");
    const booking = await confirm(context);
    await reschedule.execute(context, {
      bookingId: booking.id,
      expectedVersion: 1,
      startsAt: instant("2026-09-07T16:00:00Z"),
    });

    await expect(
      reschedule.execute(context, {
        bookingId: booking.id,
        expectedVersion: 1,
        startsAt: instant("2026-09-07T18:00:00Z"),
      }),
    ).rejects.toThrow(StaleBookingVersionError);
    await expect(
      cancel.execute(context, { bookingId: booking.id, expectedVersion: 1, reason: "stale" }),
    ).rejects.toThrow(StaleBookingVersionError);
    await expect(
      complete.execute(context, { bookingId: booking.id, expectedVersion: 1 }),
    ).rejects.toThrow(StaleBookingVersionError);

    const { rows } = await admin.query<{ status: string; version: number; starts_at: string }>(
      `SELECT status, version, to_json(starts_at) #>> '{}' AS starts_at
         FROM public.bookings WHERE id = $1`,
      [booking.id],
    );
    expect(rows[0]).toMatchObject({ status: "confirmed", version: 2 });
    expect(rows[0]!.starts_at).toBe("2026-09-07T16:00:00+00:00");
  });

  it("reports the real current version in the stale-write error", async () => {
    const context = await seedWorkspace("staleversion");
    const booking = await confirm(context);
    await complete.execute(context, { bookingId: booking.id, expectedVersion: 1 });

    try {
      await complete.execute(context, { bookingId: booking.id, expectedVersion: 1 });
      expect.unreachable("expected a stale-version rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(StaleBookingVersionError);
      expect((error as StaleBookingVersionError).expectedVersion).toBe(1);
      expect((error as StaleBookingVersionError).actualVersion).toBe(2);
    }
  });

  it("treats another workspace's booking as not found, never as a cross-workspace error", async () => {
    const owner = await seedWorkspace("owner");
    const stranger = await seedWorkspace("stranger");
    const booking = await confirm(owner);

    await expect(
      cancel.execute(stranger, { bookingId: booking.id, expectedVersion: 1, reason: "nope" }),
    ).rejects.toThrow(BookingNotFoundError);
    await expect(
      complete.execute(stranger, { bookingId: booking.id, expectedVersion: 1 }),
    ).rejects.toThrow(BookingNotFoundError);
    await expect(
      reschedule.execute(stranger, {
        bookingId: booking.id,
        expectedVersion: 1,
        startsAt: instant("2026-09-12T09:00:00Z"),
      }),
    ).rejects.toThrow(BookingNotFoundError);

    const { rows } = await admin.query<{ status: string; version: number }>(
      `SELECT status, version FROM public.bookings WHERE id = $1`,
      [booking.id],
    );
    expect(rows[0]).toMatchObject({ status: "confirmed", version: 1 });
  });

  it("reports an unknown booking id as not found", async () => {
    const context = await seedWorkspace("missing");
    await expect(
      complete.execute(context, {
        bookingId: asBookingId("99999999-9999-4999-8999-999999999999"),
        expectedVersion: 1,
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });
});
