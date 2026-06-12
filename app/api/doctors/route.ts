import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getActor } from "@/lib/booking-server";
import type { ApiDoctor } from "@/lib/booking-types";

/**
 * Doctor roster for the booking selects (patient picks a doctor/specialty;
 * staff picks whose calendar to manage). Public clinic info only — name +
 * specialty, never the linked User. Requires auth so it isn't an open scrape
 * endpoint. NetworkOnly in the SW (see next.config.ts).
 *
 * ?unlinked=1 → only doctors WITHOUT an account (Doctor.userId IS NULL), used
 * by the admin role manager to bind a new DOCTOR user to a doctor record.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const unlinked =
    new URL(request.url).searchParams.get("unlinked") === "1";

  try {
    const rows = await prisma.doctor.findMany({
      where: unlinked ? { userId: null } : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        specialty: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json<ApiDoctor[]>(
      rows.map((d) => ({
        id: d.id,
        name: d.name,
        specialtyId: d.specialty?.id ?? null,
        specialtyName: d.specialty?.name ?? null,
      })),
    );
  } catch (err) {
    console.error("GET /api/doctors failed", err);
    return apiError(500, "server", "Не вдалося завантажити лікарів");
  }
}
