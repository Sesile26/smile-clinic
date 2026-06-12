import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, shopError } from "@/lib/shop-server";
import type { AdminUser, AdminUsersPage, Linkage } from "@/lib/admin-users";

/**
 * GET /api/admin/users — user list with role + linkage (Patient/Doctor).
 * ADMIN ONLY (re-checked here, independent of the proxy guard). Search by
 * name/email, filter by role, offset pagination (page/pageSize 25|50|100).
 */

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const VALID_ROLE = new Set<string>(Object.values(Role));

function toLinkage(u: {
  patient: { name: string } | null;
  doctor: { id: string; name: string; specialty: { id: string; name: string } | null } | null;
}): Linkage {
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

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (actor.role !== Role.ADMIN) {
    return shopError(403, "forbidden", "Лише для адміністратора");
  }

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
  const rawSize = Number(searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  const q = (searchParams.get("q") ?? "").trim();
  const roleParam = searchParams.get("role");

  const where: Prisma.UserWhereInput = {};
  if (roleParam && VALID_ROLE.has(roleParam)) where.role = roleParam as Role;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          patient: { select: { name: true } },
          doctor: { select: { id: true, name: true, specialty: { select: { id: true, name: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const items: AdminUser[] = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      linkage: toLinkage(u),
    }));

    return NextResponse.json<AdminUsersPage>({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error("GET /api/admin/users failed", err);
    return shopError(500, "server", "Не вдалося завантажити користувачів");
  }
}
