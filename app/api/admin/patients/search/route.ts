import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getActor, isStaff, apiError } from "@/lib/booking-server";
import type { ManualPatient } from "@/lib/manual-booking";

/**
 * GET /api/admin/patients/search?q= — typeahead for the manual-booking wizard.
 * STAFF/ADMIN and DOCTOR (a doctor records onto their own calendar and must be
 * able to find an existing patient). Matches name (insensitive) or phone digits.
 * Empty q → the 20 most recent patients. Capped at 20 rows.
 */

const LIMIT = 20;

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");
  if (!isStaff(actor.role) && actor.role !== Role.DOCTOR) {
    return apiError(403, "forbidden", "Лише для персоналу");
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

  const where: Prisma.PatientWhereInput = {};
  if (q) {
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
  }

  try {
    const rows = await prisma.patient.findMany({
      where,
      orderBy: q ? { name: "asc" } : { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, name: true, phone: true, email: true },
    });
    return NextResponse.json<ManualPatient[]>(rows);
  } catch (err) {
    console.error("GET /api/admin/patients/search failed", err);
    return apiError(500, "server", "Не вдалося виконати пошук");
  }
}
