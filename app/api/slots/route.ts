import { NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { SlotStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { apiError, canManageDoctor, getActor } from "@/lib/booking-server";
import { SLOT_DURATION_MIN } from "@/lib/booking-time";
import type { ApiSlot } from "@/lib/booking-types";

/**
 * Availability slots.
 *
 *  GET    ?doctorId&from&to  → slots for a doctor in [from, to).
 *                              Managers (owner doctor / staff / admin) see all
 *                              statuses; everyone else sees free slots only.
 *  POST   { doctorId, startsAt, endsAt } → create a free slot.
 *  DELETE { id }            → delete a FREE slot (booked slots are protected).
 *
 * Role + ownership are enforced server-side (see lib/booking-server).
 * Times on the wire are UTC ISO; the DB stores UTC.
 */

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000; // ~2 months guard

function toApiSlot(s: {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: SlotStatus;
}): ApiSlot {
  return {
    id: s.id,
    doctorId: s.doctorId,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    status: s.status,
  };
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctorId");
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  if (!doctorId || !fromRaw || !toRaw) {
    return apiError(400, "validation", "doctorId, from і to є обовʼязковими");
  }

  const from = new Date(fromRaw);
  const to = new Date(toRaw);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return apiError(400, "validation", "Невалідний діапазон дат");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return apiError(400, "validation", "Діапазон завеликий");
  }

  // Managers see free + booked (so the grid can lock booked cells); patients
  // (and doctors peeking at another doctor) see only free slots.
  const canSeeAll = canManageDoctor(actor, doctorId);

  try {
    const rows = await prisma.availabilitySlot.findMany({
      where: {
        doctorId,
        startsAt: { gte: from, lt: to },
        ...(canSeeAll ? {} : { status: SlotStatus.free }),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        doctorId: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    });
    return NextResponse.json<ApiSlot[]>(rows.map(toApiSlot));
  } catch (err) {
    console.error("GET /api/slots failed", err);
    return apiError(500, "server", "Не вдалося завантажити слоти");
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }

  const { doctorId, startsAt, endsAt } = (body ?? {}) as {
    doctorId?: string;
    startsAt?: string;
    endsAt?: string;
  };

  if (!doctorId || !startsAt || !endsAt) {
    return apiError(
      400,
      "validation",
      "doctorId, startsAt і endsAt є обовʼязковими",
    );
  }

  if (!canManageDoctor(actor, doctorId)) {
    return apiError(403, "forbidden", "Немає прав керувати цим розкладом");
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return apiError(400, "validation", "Невалідний час слота");
  }

  // Booking is hour-only: the server rejects any slot that isn't exactly
  // SLOT_DURATION_MIN (60 min), so the UI and the DB can never drift apart.
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes !== SLOT_DURATION_MIN) {
    return apiError(
      400,
      "validation",
      `Тривалість слота має бути ${SLOT_DURATION_MIN} хв`,
    );
  }

  try {
    // App-level overlap guard: reject a slot that intersects an existing one
    // for this doctor. RACE: two concurrent creates can both pass this check
    // before either inserts. Acceptable for v1 — the @@unique([doctorId,
    // startsAt]) index still blocks exact-start duplicates; partial overlaps at
    // different starts are a known, low-impact gap to harden later (DB
    // exclusion constraint / advisory lock).
    const overlap = await prisma.availabilitySlot.findFirst({
      where: {
        doctorId,
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
      select: { id: true },
    });
    if (overlap) {
      return apiError(409, "overlap", "Слот перетинається з наявним");
    }

    const created = await prisma.availabilitySlot.create({
      data: { doctorId, startsAt: start, endsAt: end, status: SlotStatus.free },
      select: {
        id: true,
        doctorId: true,
        startsAt: true,
        endsAt: true,
        status: true,
      },
    });
    return NextResponse.json<ApiSlot>(toApiSlot(created), { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Raced the overlap check onto the exact same start.
      return apiError(409, "duplicate", "Слот на цей час уже існує");
    }
    console.error("POST /api/slots failed", err);
    return apiError(500, "server", "Не вдалося створити слот");
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) return apiError(401, "unauthorized", "Потрібен вхід");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "validation", "Невалідний JSON");
  }

  const { id } = (body ?? {}) as { id?: string };
  if (!id) return apiError(400, "validation", "id є обовʼязковим");

  try {
    const slot = await prisma.availabilitySlot.findUnique({
      where: { id },
      select: { id: true, doctorId: true, status: true },
    });
    if (!slot) return apiError(404, "not_found", "Слот не знайдено");

    if (!canManageDoctor(actor, slot.doctorId)) {
      return apiError(403, "forbidden", "Немає прав керувати цим розкладом");
    }
    if (slot.status !== SlotStatus.free) {
      return apiError(409, "slot_busy", "Не можна видалити зайнятий слот");
    }

    // Conditional delete: status guard closes the race where the slot gets
    // booked between the check above and this statement.
    const res = await prisma.availabilitySlot.deleteMany({
      where: { id, status: SlotStatus.free },
    });
    if (res.count !== 1) {
      return apiError(409, "slot_busy", "Слот щойно зайняли — оновіть розклад");
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/slots failed", err);
    return apiError(500, "server", "Не вдалося видалити слот");
  }
}
