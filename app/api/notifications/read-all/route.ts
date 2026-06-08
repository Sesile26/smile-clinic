import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/notifications/read-all — mark all of the current user's unread
 * notifications as read. Scoped to the session's userId.
 */
export const dynamic = "force-dynamic";

export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  }

  try {
    const res = await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true, updated: res.count });
  } catch (err) {
    console.error("PATCH /api/notifications/read-all failed", err);
    return NextResponse.json({ error: "Помилка" }, { status: 500 });
  }
}
