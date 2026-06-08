import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { NotificationDTO } from "@/lib/notifications";

/**
 * GET /api/notifications — the CURRENT user's notifications (latest 50) plus the
 * unread count. Fallback for when SSE isn't connected (initial load, reconnect,
 * unsupported client). Owner-scoped: where userId = session.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
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
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const items: NotificationDTO[] = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }));
    return NextResponse.json({ items, unread });
  } catch (err) {
    console.error("GET /api/notifications failed", err);
    return NextResponse.json(
      { error: "Не вдалося завантажити сповіщення" },
      { status: 500 },
    );
  }
}
