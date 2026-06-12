import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { ApiSpecialty } from "@/lib/specialties";

/**
 * Single specialty mutations — STAFF/ADMIN only (re-checked server-side).
 * Same policy as /api/categories/[id].
 *
 *  PATCH  → rename. Same uniqueness rule as create (P2002 → "вже існує").
 *           Doctors keep pointing at the specialty by id, so the new name shows
 *           everywhere automatically (booking filter, cards, …).
 *  DELETE → deletion policy:
 *           • no doctors              → delete immediately;
 *           • doctors + ?reassign=null → move them to "Без спеціальності"
 *             (specialtyId = null) AND delete, in ONE transaction;
 *           • doctors + no param      → 409 with the doctor count, so the UI
 *             can confirm the reassignment first.
 *           (The schema FK is onDelete: SetNull, so a bare delete would also
 *           null the doctors — but we require the explicit param as a guard
 *           against accidental data loss, and do the move in a transaction.)
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const name = (body as { name?: unknown } | null)?.name;
  if (typeof name !== "string" || name.trim() === "") {
    return shopError(400, "validation", "Вкажіть назву спеціальності");
  }

  try {
    const updated = await prisma.specialty.update({
      where: { id },
      data: { name: name.trim() },
      select: { id: true, name: true, _count: { select: { doctors: true } } },
    });
    return NextResponse.json<ApiSpecialty>({
      id: updated.id,
      name: updated.name,
      doctorCount: updated._count.doctors,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return shopError(409, "conflict", "Така спеціальність вже існує");
      }
      if (err.code === "P2025") {
        return shopError(404, "not_found", "Спеціальність не знайдено");
      }
    }
    console.error("PATCH /api/specialties/[id] failed", err);
    return shopError(500, "server", "Не вдалося перейменувати спеціальність");
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  // Explicit opt-in to move doctors to "Без спеціальності" before deleting.
  const reassign = searchParams.get("reassign") === "null";

  try {
    const specialty = await prisma.specialty.findUnique({
      where: { id },
      select: { id: true, _count: { select: { doctors: true } } },
    });
    if (!specialty) {
      return shopError(404, "not_found", "Спеціальність не знайдено");
    }

    const doctorCount = specialty._count.doctors;

    if (doctorCount > 0 && !reassign) {
      // Block accidental deletion — the UI confirms and retries with reassign.
      return NextResponse.json(
        {
          error: `У спеціальності ${doctorCount} лікар(ів)`,
          code: "conflict",
          doctorCount,
        },
        { status: 409 },
      );
    }

    if (doctorCount > 0) {
      // Move doctors to "Без спеціальності" and delete, atomically.
      await prisma.$transaction([
        prisma.doctor.updateMany({
          where: { specialtyId: id },
          data: { specialtyId: null },
        }),
        prisma.specialty.delete({ where: { id } }),
      ]);
    } else {
      await prisma.specialty.delete({ where: { id } });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return shopError(404, "not_found", "Спеціальність не знайдено");
    }
    console.error("DELETE /api/specialties/[id] failed", err);
    return shopError(500, "server", "Не вдалося видалити спеціальність");
  }
}
