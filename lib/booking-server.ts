/**
 * Server-side authorization helpers for the booking feature.
 *
 * SECURITY: role and ownership are decided HERE, from the session + a fresh DB
 * lookup — never from a client-supplied field. The JWT carries a `doctorId`
 * hint for the UI, but mutating routes re-resolve the actor's own Doctor row so
 * a tampered client can't act as another doctor.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/generated/prisma/enums";
import type { ApiError, ApiErrorCode } from "@/lib/booking-types";

export interface Actor {
  userId: string;
  role: Role;
  patientId: string | null;
  email: string | null;
  name: string | null;
  /** The Doctor row this user owns, if any (authoritative, from DB). */
  ownDoctorId: string | null;
}

/** Resolve the current actor, or null if unauthenticated. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const doctor = await prisma.doctor.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  return {
    userId: session.user.id,
    role: session.user.role,
    patientId: session.user.patientId ?? null,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    ownDoctorId: doctor?.id ?? null,
  };
}

export function isStaff(role: Role): boolean {
  return role === Role.ADMIN || role === Role.STAFF;
}

/** Can this actor create/delete slots for `doctorId`? */
export function canManageDoctor(actor: Actor, doctorId: string): boolean {
  if (isStaff(actor.role)) return true; // staff/admin manage anyone
  if (actor.role === Role.DOCTOR) return actor.ownDoctorId === doctorId;
  return false; // patients never manage slots
}

/** JSON error with a stable machine code. */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>({ error: message, code }, { status });
}
