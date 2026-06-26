import { EventEmitter } from "node:events";
import { prisma } from "@/lib/prisma";
import { Role, type NotificationType } from "@/lib/generated/prisma/enums";

/**
 * Notifications: DB is the source of truth; realtime delivery is an in-process
 * EventEmitter consumed by the SSE route (GET /api/notifications/stream).
 *
 * FLOW:  event → createNotification() writes the row → emits on `user:<id>` →
 *        every open SSE connection for that user pushes it to the browser.
 *
 * ⚠️ LIMITATION: the emitter is in-memory and per-process. This works on ONE
 * Node instance (local / single VPS). For multiple instances or serverless,
 * swap ONLY the transport (Redis pub/sub, Postgres LISTEN/NOTIFY, Pusher) —
 * the DB write stays authoritative and the API/SSE contract is unchanged.
 * (GET /api/notifications remains the fallback when SSE isn't connected.)
 */

// Persist the emitter across dev hot-reloads so listeners aren't orphaned.
const g = globalThis as unknown as { __notifEmitter?: EventEmitter };
const emitter = g.__notifEmitter ?? new EventEmitter();
emitter.setMaxListeners(0); // unbounded — one listener per open SSE connection
g.__notifEmitter = emitter;

export interface NotificationDTO {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  /** ISO datetime (UTC). */
  createdAt: string;
}

const channel = (userId: string) => `user:${userId}`;

/** Subscribe an SSE connection to a user's events. Returns an unsubscribe fn. */
export function subscribe(
  userId: string,
  onEvent: (n: NotificationDTO) => void,
): () => void {
  const ch = channel(userId);
  emitter.on(ch, onEvent);
  return () => emitter.off(ch, onEvent);
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

/**
 * Persist a notification and push it to the user's live SSE connections.
 * Returns the created DTO. Callers should not let a notification failure break
 * the primary action — wrap in try/catch at the call site.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationDTO> {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      body: true,
      link: true,
      isRead: true,
      createdAt: true,
    },
  });
  const dto: NotificationDTO = { ...row, createdAt: row.createdAt.toISOString() };
  emitter.emit(channel(input.userId), dto);
  return dto;
}

/** Fan a notification out to every STAFF/ADMIN user (e.g. a new order). */
export async function notifyStaff(
  input: Omit<CreateNotificationInput, "userId">,
): Promise<void> {
  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.STAFF, Role.ADMIN] } },
    select: { id: true },
  });
  await Promise.all(
    staff.map((u) => createNotification({ ...input, userId: u.id })),
  );
}

/** Clinic timezone — used so "today" is computed at the clinic's wall-clock,
 *  not the server's UTC, avoiding day-boundary mistakes. */
const CLINIC_TZ = "Europe/Kyiv";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("uk-UA", {
  timeZone: CLINIC_TZ,
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("uk-UA", {
  timeZone: CLINIC_TZ,
  day: "numeric",
  month: "long",
});

/**
 * Tell the people who manage a freed slot that a patient cancelled: the slot's
 * owning DOCTOR (if their account is linked via Doctor.userId) AND every
 * STAFF/ADMIN. Recipients are DEDUPED (a Set of userIds) so nobody gets two
 * copies. Today's cancellations are flagged as urgent (the window just opened
 * up for today); "today" is computed in the clinic timezone.
 *
 * Call AFTER the cancel transaction commits.
 */
export async function notifyManagersOfCancellation(input: {
  doctorId: string;
  doctorName: string;
  patientName: string;
  date: Date;
}): Promise<void> {
  const [doctor, staff] = await Promise.all([
    prisma.doctor.findUnique({
      where: { id: input.doctorId },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: { role: { in: [Role.STAFF, Role.ADMIN] } },
      select: { id: true },
    }),
  ]);

  const recipients = new Set<string>();
  if (doctor?.userId) recipients.add(doctor.userId); // owner doctor, if linked
  for (const u of staff) recipients.add(u.id); // staff/admin
  if (recipients.size === 0) return;

  const isToday = dayKeyFmt.format(input.date) === dayKeyFmt.format(new Date());
  const when = isToday
    ? `сьогодні, ${timeFmt.format(input.date)}`
    : `${dateFmt.format(input.date)}, ${timeFmt.format(input.date)}`;

  // Type stays "appointment_status" (no new enum); urgency is signalled in the
  // title so the doctor sees today's freed window at a glance.
  const title = isToday
    ? "Термінове: скасування на сьогодні"
    : "Пацієнт скасував запис";
  const body = `Пацієнт ${input.patientName} скасував запис на ${when}. Лікар: ${input.doctorName}.`;

  await Promise.all(
    [...recipients].map((userId) =>
      createNotification({
        userId,
        type: "appointment_status",
        title,
        body,
        link: "/booking",
      }),
    ),
  );
}

/**
 * NEW-booking notice for EVERY new booking (today or future). The owning DOCTOR
 * (if their account is linked via Doctor.userId) AND every STAFF/ADMIN get it,
 * DEDUPED — a doctor who is also staff/admin gets a single notification. Today's
 * bookings are worded "сьогодні" (and need an immediate confirm/reject); future
 * ones carry the date.
 *
 * Call AFTER the booking transaction commits (so a slot-race / limit / rate
 * limit failure never produces a phantom notification). Best-effort.
 */
export async function notifyManagersOfNewBooking(input: {
  doctorId: string;
  patientId: string;
  date: Date;
  /** Manual staff bookings are already confirmed — adjust the wording. */
  confirmed?: boolean;
}): Promise<void> {
  // "Today" only tweaks the wording now; every booking is notified.
  const isToday = dayKeyFmt.format(input.date) === dayKeyFmt.format(new Date());

  const [doctor, staff, patient] = await Promise.all([
    prisma.doctor.findUnique({
      where: { id: input.doctorId },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: { role: { in: [Role.STAFF, Role.ADMIN] } },
      select: { id: true },
    }),
    prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { name: true },
    }),
  ]);

  const recipients = new Set<string>();
  if (doctor?.userId) recipients.add(doctor.userId); // owner doctor, if linked
  for (const u of staff) recipients.add(u.id); // staff/admin
  if (recipients.size === 0) return;

  const patientName = patient?.name ?? "Пацієнт";
  const when = isToday
    ? `сьогодні, ${timeFmt.format(input.date)}`
    : `${dateFmt.format(input.date)}, ${timeFmt.format(input.date)}`;
  const title = isToday ? "Новий запис на сьогодні" : "Новий запис";
  const suffix = input.confirmed ? "(підтверджено)" : "(потребує підтвердження)";
  const body = `Новий запис на ${when} — ${patientName} ${suffix}.`;

  await Promise.all(
    [...recipients].map((userId) =>
      createNotification({
        userId,
        type: "appointment_new",
        title,
        body,
        link: "/booking",
      }),
    ),
  );
}
