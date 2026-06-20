import { NextResponse } from "next/server";
import { SlotStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, getActor } from "@/lib/booking-server";
import type { NextFreeSlot } from "@/lib/booking-types";

/**
 * GET /api/slots/next-free?doctorId=… — the doctor's SOONEST bookable slot.
 *
 * One light query (free + startsAt >= now, ordered ascending, take 1) instead of
 * paging through weeks. blocked/booked/past are excluded by the free + >= now
 * filter. Returns the slot's id + startsAt (UTC ISO), or `null` when the doctor
 * has no upcoming free slots. Times are UTC end-to-end (the client renders
 * local), matching the rest of the booking layer.
 */
export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const doctorId = new URL(request.url).searchParams.get("doctorId");
  if (!doctorId) return apiError(400, "validation", "doctorId є обовʼязковим");

  try {
    const slot = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId,
        status: SlotStatus.free,
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true },
    });

    return NextResponse.json<NextFreeSlot | null>(
      slot ? { id: slot.id, startsAt: slot.startsAt.toISOString() } : null,
    );
  } catch (err) {
    console.error("GET /api/slots/next-free failed", err);
    return apiError(500, "server", "Не вдалося знайти найближчий слот");
  }
}
