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
