import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, shopError } from "@/lib/shop-server";
import { createNotification } from "@/lib/notifications";
import type { AdminUser, Linkage } from "@/lib/admin-users";

/**
 * PATCH /api/admin/users/[id]/role — change a user's role. ADMIN ONLY.
 *
 * SERVER RULES (enforced here, not just in the UI):
 *  1. Can't change YOUR OWN role (session id === [id]) → 403.
 *  2. Can't demote the LAST admin → 409. The admin rows are locked FOR UPDATE
 *     inside the transaction, so two concurrent demotions can't both pass the
 *     "count > 1" check and leave zero admins.
 *  3. Grant DOCTOR: body has doctorId (an existing Doctor with no account) OR
 *     newDoctor {name, specialtyId|null}. In one transaction: role=DOCTOR AND
 *     Doctor.userId=this user. Linking a doctor already tied to another account
 *     fails clearly. Any doctor previously linked to this user is unlinked first.
 *  4. Remove DOCTOR: in one transaction role=new AND Doctor.userId=null — the
 *     Doctor row, its appointments and slots are KEPT.
 *  On success the user gets a `role_changed` notification (best-effort).
 */

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Адміністратор",
  STAFF: "Персонал",
  DOCTOR: "Лікар",
  PATIENT: "Пацієнт",
};

/** Carries an HTTP status + machine code out of the transaction callback. */
class RuleError extends Error {
  constructor(
    public status: number,
    public code: "forbidden" | "conflict" | "validation" | "not_found",
    message: string,
  ) {
    super(message);
  }
}

const SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  patient: { select: { name: true } },
  doctor: { select: { id: true, name: true, specialty: { select: { id: true, name: true } } } },
} as const;

type UserRow = {
  patient: { name: string } | null;
  doctor: { id: string; name: string; specialty: { id: string; name: string } | null } | null;
};
function toLinkage(u: UserRow): Linkage {
  if (u.doctor) {
    return {
      type: "doctor",
      id: u.doctor.id,
      name: u.doctor.name,
      specialtyId: u.doctor.specialty?.id ?? null,
      specialtyName: u.doctor.specialty?.name ?? null,
    };
  }
  if (u.patient) return { type: "patient", name: u.patient.name };
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  // ADMIN: full control. STAFF: LIMITED (PATIENT/DOCTOR/STAFF only, never ADMIN
  // and never an admin user) — enforced below, independent of the UI. Anyone
  // else is rejected.
  const isAdminActor = actor.role === Role.ADMIN;
  const isStaffActor = actor.role === Role.STAFF;
  if (!isAdminActor && !isStaffActor) {
    return shopError(403, "forbidden", "Немає доступу");
  }

  const { id } = await params;

  // Rule 1 — can't change your own role.
  if (id === actor.userId) {
    return shopError(403, "forbidden", "Не можна змінити власну роль");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return shopError(400, "validation", "Невалідний JSON");
  }
  const b = (body ?? {}) as {
    role?: unknown;
    doctorId?: unknown;
    newDoctor?: { name?: unknown; specialtyId?: unknown };
  };
  const newRole = b.role;
  if (typeof newRole !== "string" || !(newRole in ROLE_LABEL)) {
    return shopError(400, "validation", "Невалідна роль");
  }
  const role = newRole as Role;

  // STAFF privilege-escalation guard: cannot GRANT the ADMIN role (to anyone,
  // including themselves). Rejected regardless of what the UI shows.
  if (isStaffActor && role === Role.ADMIN) {
    console.warn(
      `[role] escalation blocked: STAFF ${actor.userId} tried to set ADMIN on ${id}`,
    );
    return shopError(403, "forbidden", "Персонал не може призначати роль адміністратора");
  }

  // Validate DOCTOR binding inputs up front. A new doctor needs a name; the
  // specialty is chosen from the directory by id (or null = "Без спеціальності").
  let bindDoctorId: string | null = null;
  let newDoctor: { name: string; specialtyId: string | null } | null = null;
  if (role === Role.DOCTOR) {
    const hasExisting = typeof b.doctorId === "string" && b.doctorId.trim() !== "";
    const nd = b.newDoctor;
    const hasNew =
      !!nd && typeof nd.name === "string" && nd.name.trim().length >= 2;
    if (hasExisting === hasNew) {
      return shopError(
        400,
        "validation",
        "Для ролі «Лікар» вкажіть наявного лікаря АБО створіть нового",
      );
    }
    if (hasExisting) {
      bindDoctorId = (b.doctorId as string).trim();
    } else {
      const specialtyId =
        typeof nd!.specialtyId === "string" && nd!.specialtyId.trim() !== ""
          ? nd!.specialtyId.trim()
          : null;
      newDoctor = { name: (nd!.name as string).trim(), specialtyId };
    }
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!target) return shopError(404, "not_found", "Користувача не знайдено");

    // STAFF privilege-escalation guard: cannot MODIFY a user who is currently
    // ADMIN (no demoting/touching admins). Rejected before any change.
    if (isStaffActor && target.role === Role.ADMIN) {
      console.warn(
        `[role] escalation blocked: STAFF ${actor.userId} tried to modify ADMIN ${id}`,
      );
      return shopError(403, "forbidden", "Персонал не може змінювати адміністратора");
    }

    // No-op (same role, no doctor re-bind) — return current state.
    if (target.role === role && role !== Role.DOCTOR) {
      const cur = await prisma.user.findUniqueOrThrow({ where: { id }, select: SELECT });
      return NextResponse.json<AdminUser>(toApi(cur));
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Rule 2 — protect the last admin (lock admin rows to serialize).
      if (target.role === Role.ADMIN && role !== Role.ADMIN) {
        await tx.$queryRaw`SELECT id FROM "User" WHERE role::text = 'ADMIN' FOR UPDATE`;
        const admins = await tx.user.count({ where: { role: Role.ADMIN } });
        if (admins <= 1) {
          throw new RuleError(409, "conflict", "Має лишатися щонайменше один адміністратор");
        }
      }

      if (role === Role.DOCTOR) {
        // Rule 3 — unlink any doctor already tied to this user, then bind.
        await tx.doctor.updateMany({ where: { userId: id }, data: { userId: null } });
        if (bindDoctorId) {
          const linked = await tx.doctor.updateMany({
            where: { id: bindDoctorId, userId: null },
            data: { userId: id },
          });
          if (linked.count !== 1) {
            throw new RuleError(
              409,
              "conflict",
              "Лікаря не знайдено або вже привʼязано до іншого акаунта",
            );
          }
        } else if (newDoctor) {
          await tx.doctor.create({
            data: {
              name: newDoctor.name,
              specialtyId: newDoctor.specialtyId,
              userId: id,
            },
          });
        }
      } else if (target.role === Role.DOCTOR) {
        // Rule 4 — demoting a doctor: unlink, keep the Doctor row + history.
        await tx.doctor.updateMany({ where: { userId: id }, data: { userId: null } });
      }

      return tx.user.update({ where: { id }, data: { role }, select: SELECT });
    });

    // Notify the affected user (best-effort).
    try {
      await createNotification({
        userId: id,
        type: "role_changed",
        title: "Вашу роль змінено",
        body: `Тепер ваша роль: ${ROLE_LABEL[role]}.`,
      });
    } catch (e) {
      console.error("notify (role_changed) failed", e);
    }

    return NextResponse.json<AdminUser>(toApi(updated));
  } catch (err) {
    if (err instanceof RuleError) {
      return shopError(err.status, err.code, err.message);
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique violation on Doctor.userId, just in case.
      if (err.code === "P2002") {
        return shopError(409, "conflict", "Лікаря вже привʼязано до іншого акаунта");
      }
      // FK violation — the chosen specialty no longer exists.
      if (err.code === "P2003") {
        return shopError(400, "validation", "Обрану спеціальність не знайдено");
      }
    }
    console.error("PATCH /api/admin/users/[id]/role failed", err);
    return shopError(500, "server", "Не вдалося змінити роль");
  }
}

function toApi(u: UserRow & {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  createdAt: Date;
}): AdminUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    linkage: toLinkage(u),
  };
}
