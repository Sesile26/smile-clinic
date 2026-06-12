import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, shopError } from "@/lib/shop-server";
import type { AdminDoctor } from "@/lib/admin-users";

/**
 * PATCH /api/admin/doctors/[id] — update a doctor. ADMIN ONLY (aligned with the
 * Users tab; re-checked here independently of the proxy guard).
 *
 * General by design — the body may carry more doctor fields later (e.g. name) —
 * but for now the meaningful field is `specialtyId` (string | null):
 *   • a string → must be an existing Specialty id (else 400);
 *   • null     → "Без спеціальності".
 * Doctors reference the specialty by id, so the change shows everywhere the
 * relation is read (booking card/filter, admin/patients, the Specialties tab
 * doctor counts).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (actor.role !== Role.ADMIN) {
    return shopError(403, "forbidden", "Лише для адміністратора");
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const b = (body ?? {}) as { specialtyId?: unknown; name?: unknown };

  const data: Prisma.DoctorUpdateInput = {};

  if ("specialtyId" in b) {
    const specialtyId = b.specialtyId;
    if (specialtyId !== null && typeof specialtyId !== "string") {
      return shopError(400, "validation", "Невалідна спеціальність");
    }
    if (typeof specialtyId === "string") {
      const exists = await prisma.specialty.findUnique({
        where: { id: specialtyId },
        select: { id: true },
      });
      if (!exists) {
        return shopError(400, "validation", "Спеціальність не знайдено");
      }
      data.specialty = { connect: { id: specialtyId } };
    } else {
      data.specialty = { disconnect: true };
    }
  }

  // Forward-compat: accept a name update too (≥2 chars), but specialtyId is the
  // field the UI currently sends.
  if (typeof b.name === "string" && b.name.trim().length >= 2) {
    data.name = b.name.trim();
  }

  if (Object.keys(data).length === 0) {
    return shopError(400, "validation", "Немає що оновлювати");
  }

  try {
    const updated = await prisma.doctor.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        specialty: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json<AdminDoctor>({
      id: updated.id,
      name: updated.name,
      specialtyId: updated.specialty?.id ?? null,
      specialtyName: updated.specialty?.name ?? null,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return shopError(404, "not_found", "Лікаря не знайдено");
    }
    console.error("PATCH /api/admin/doctors/[id] failed", err);
    return shopError(500, "server", "Не вдалося оновити лікаря");
  }
}
