/**
 * Client-safe notification types + REST fetchers. Kept SEPARATE from
 * lib/notifications.ts (which imports node:events + prisma — server only).
 */

export type NotificationType =
  | "appointment_status"
  | "appointment_new"
  | "order_new"
  | "order_status";

export interface ClientNotification {
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

export interface NotificationsResponse {
  items: ClientNotification[];
  unread: number;
}

export async function fetchNotifications(
  signal?: AbortSignal,
): Promise<NotificationsResponse> {
  const res = await fetch("/api/notifications", { cache: "no-store", signal });
  if (!res.ok) throw new Error(`notifications ${res.status}`);
  return (await res.json()) as NotificationsResponse;
}

export async function markRead(id: string): Promise<void> {
  const res = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  if (!res.ok) throw new Error(`markRead ${res.status}`);
}

export async function markAllRead(): Promise<void> {
  const res = await fetch("/api/notifications/read-all", { method: "PATCH" });
  if (!res.ok) throw new Error(`markAllRead ${res.status}`);
}
