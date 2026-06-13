import { NextResponse } from "next/server";
import { SlotStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor } from "@/lib/booking-server";
import {
  buildTimes,
  cellEndUtcISO,
  cellToUtcISO,
  SLOT_DURATION_MIN,
} from "@/lib/booking-time";

/**
 * POST /api/slots/fill-day  { doctorId, date }  → open every empty working hour
 * of a day at once. STAFF/ADMIN or the owner doctor only (same rights as a
 * single slot create).
 *
 *  • `date` is a local "YYYY-MM-DD"; the working hours come from buildTimes()
 *    (09:00–20:00, WORK_END_MIN), converted to UTC via the same helper a single
 *    create uses — so fill-day and click-to-create land on identical instants.
 *  • Skips hours that already have a slot (free/booked) and hours in the past
 *    (same "no past slots" rule as POST /api/slots).
 *  • Creates the rest in ONE transaction; returns how many were created.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }

  const { doctorId, date } = (body ?? {}) as { doctorId?: string; date?: string };
  if (!doctorId || !date) {
    return apiError(400, "validation", "doctorId і date є обовʼязковими");
  }
  if (!canManageDoctor(actor, doctorId)) {
    return apiError(403, "forbidden", "Немає прав керувати цим розкладом");
  }

  const m = DATE_RE.exec(date);
  if (!m) return apiError(400, "validation", "Невалідна дата (очікується YYYY-MM-DD)");
  const localDay = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(localDay.getTime())) {
    return apiError(400, "validation", "Невалідна дата");
  }

  const now = new Date();
  // Working-hour candidates for the day, minus past hours.
  const candidates = buildTimes()
    .map((time) => ({
      start: new Date(cellToUtcISO(localDay, time)),
      end: new Date(cellEndUtcISO(localDay, time, SLOT_DURATION_MIN)),
    }))
    .filter((c) => c.start >= now);

  if (candidates.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  const windowStart = candidates[0].start;
  const windowEnd = candidates[candidates.length - 1].end;

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Hours already occupied by any slot (free/booked) are skipped.
      const existing = await tx.availabilitySlot.findMany({
        where: { doctorId, startsAt: { gte: windowStart, lt: windowEnd } },
        select: { startsAt: true },
      });
      const taken = new Set(existing.map((s) => s.startsAt.getTime()));

      const data = candidates
        .filter((c) => !taken.has(c.start.getTime()))
        .map((c) => ({
          doctorId,
          startsAt: c.start,
          endsAt: c.end,
          status: SlotStatus.free,
        }));
      if (data.length === 0) return 0;

      // skipDuplicates: backstop for the @@unique([doctorId, startsAt]) race.
      const res = await tx.availabilitySlot.createMany({ data, skipDuplicates: true });
      return res.count;
    });

    return NextResponse.json({ created });
  } catch (err) {
    console.error("POST /api/slots/fill-day failed", err);
    return apiError(500, "server", "Не вдалося заповнити день");
  }
}
