/**
 * TanStack Query bindings for the Booking surface (ADR-003: TanStack Query
 * is the ONLY server-state cache — nothing here keeps a second copy in
 * component state, and no Booking draft is ever persisted server-side).
 *
 * Every query/mutation is keyed through `./keys.ts`, i.e. workspace-scoped.
 * Mutations write the authoritative server response straight into the
 * booking's own key and invalidate nothing outside the active workspace.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import {
  cancelBooking,
  completeBooking,
  createBooking,
  fetchActiveServices,
  fetchBooking,
  fetchService,
  rescheduleBooking,
  type ActiveServicesPage,
  type BookingCommandInput,
  type CreateBookingInput,
} from "./booking-api.js";
import { activeServicesKey, bookingKey, serviceKey } from "./keys.js";
import { ApiProblemError } from "./problem.js";
import type { Booking, ServiceDetail } from "./types.js";

/**
 * A `session-invalid`/`forbidden`/`not-found` answer is a decision, not a
 * blip: retrying it only delays the state the operator needs to see.
 */
function retryOnlyTransient(failureCount: number, error: Error): boolean {
  if (error instanceof ApiProblemError) return false;
  return failureCount < 2;
}

export function useActiveServices(
  workspaceId: string,
  enabled = true,
): UseQueryResult<ActiveServicesPage, Error> {
  return useQuery({
    queryKey: activeServicesKey(workspaceId),
    queryFn: fetchActiveServices,
    enabled,
    retry: retryOnlyTransient,
  });
}

export function useService(
  workspaceId: string,
  serviceId: string | undefined,
): UseQueryResult<ServiceDetail, Error> {
  return useQuery({
    queryKey: serviceKey(workspaceId, serviceId ?? "unknown"),
    queryFn: () => fetchService(serviceId ?? ""),
    enabled: serviceId !== undefined,
    retry: retryOnlyTransient,
  });
}

export function useBooking(
  workspaceId: string,
  bookingId: string,
  enabled = true,
): UseQueryResult<Booking, Error> {
  return useQuery({
    queryKey: bookingKey(workspaceId, bookingId),
    queryFn: () => fetchBooking(bookingId),
    enabled,
    retry: retryOnlyTransient,
  });
}

export function useCreateBooking(
  workspaceId: string,
): UseMutationResult<Booking, Error, CreateBookingInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSuccess: (booking) => {
      queryClient.setQueryData(bookingKey(workspaceId, booking.id), booking);
    },
  });
}

/**
 * Reschedule/cancel/complete all return the booking's authoritative new
 * state, so the cache is SET from the response rather than optimistically
 * guessed — an optimistic write here would be the "silently overwrite"
 * behaviour `stale-write` exists to prevent.
 */
function useBookingCommand<TInput extends BookingCommandInput>(
  workspaceId: string,
  command: (input: TInput) => Promise<Booking>,
): UseMutationResult<Booking, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: command,
    onSuccess: (booking) => {
      queryClient.setQueryData(bookingKey(workspaceId, booking.id), booking);
    },
    onError: (error, input) => {
      // A stale version means our copy is out of date: re-read the booking
      // so the operator is looking at the current record before deciding
      // what to do next. Nothing is written on their behalf.
      if (error instanceof ApiProblemError && error.kind === "stale-write") {
        void queryClient.invalidateQueries({ queryKey: bookingKey(workspaceId, input.id) });
      }
      if (error instanceof ApiProblemError && error.kind === "invalid-transition") {
        void queryClient.invalidateQueries({ queryKey: bookingKey(workspaceId, input.id) });
      }
    },
  });
}

export function useRescheduleBooking(
  workspaceId: string,
): UseMutationResult<Booking, Error, BookingCommandInput & { startsAt: string }> {
  return useBookingCommand(workspaceId, rescheduleBooking);
}

export function useCancelBooking(
  workspaceId: string,
): UseMutationResult<Booking, Error, BookingCommandInput> {
  return useBookingCommand(workspaceId, cancelBooking);
}

export function useCompleteBooking(
  workspaceId: string,
): UseMutationResult<Booking, Error, BookingCommandInput> {
  return useBookingCommand(workspaceId, completeBooking);
}
