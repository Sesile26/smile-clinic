import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, shopError } from "@/lib/shop-server";
import type { ApiSpecialty } from "@/lib/specialties";

/**
 * Doctor specialties (the same reference-directory pattern as /api/categories).
 *
 *  GET  → list with doctor counts. Public — the booking specialty filter and
 *         the doctor form select read it; no private data is exposed.
 *  POST → create. STAFF/ADMIN only (re-checked server-side). Name must be
 *         non-empty and unique (P2002 → friendly "вже існує").
 */

function toApiSpecialty(s: {
  id: string;
  name: string;
  _count: { doctors: number };
}): ApiSpecialty {
  return { id: s.id, name: s.name, doctorCount: s._count.doctors };
}

export async function GET() {
  try {
    const rows = await prisma.specialty.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { doctors: true } } },
    });
    return NextResponse.json<ApiSpecialty[]>(rows.map(toApiSpecialty));
  } catch (err) {
    console.error("GET /api/specialties failed", err);
    return shopError(500, "server", "Не вдалося завантажити спеціальності");
  }
}

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return shopError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role)) {
    return shopError(403, "forbidden", "Лише для персоналу");
  }

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
    const created = await prisma.specialty.create({
      data: { name: name.trim() },
      select: { id: true, name: true, _count: { select: { doctors: true } } },
    });
    return NextResponse.json<ApiSpecialty>(toApiSpecialty(created), {
      status: 201,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return shopError(409, "conflict", "Така спеціальність вже існує");
    }
    console.error("POST /api/specialties failed", err);
    return shopError(500, "server", "Не вдалося створити спеціальність");
  }
}
