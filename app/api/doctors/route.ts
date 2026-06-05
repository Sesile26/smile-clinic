import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getActor } from "@/lib/booking-server";
import type { ApiDoctor } from "@/lib/booking-types";

/**
 * Doctor roster for the booking selects (patient picks a doctor/specialty;
 * staff picks whose calendar to manage). Public clinic info only — name +
 * specialty, never the linked User. Requires auth so it isn't an open scrape
 * endpoint. NetworkOnly in the SW (see next.config.ts).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  try {
    const rows = await prisma.doctor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, specialty: true },
    });
    return NextResponse.json<ApiDoctor[]>(rows);
  } catch (err) {
    console.error("GET /api/doctors failed", err);
    return apiError(500, "server", "Не вдалося завантажити лікарів");
  }
}
